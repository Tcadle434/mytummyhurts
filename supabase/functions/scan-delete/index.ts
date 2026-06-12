import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { refreshUserAppSnapshot } from "../_shared/appSnapshot.ts";
import { ensureUserRow } from "../_shared/db.ts";
import { requireEntitledUser } from "../_shared/entitlements.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { enqueueLearningJob } from "../_shared/learningJobs.ts";
import { errorMetadata, recordSystemEvent } from "../_shared/observability.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

const mealImagesBucket = "meal-images";

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, "method_not_allowed");
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{ scanId?: string }>(request);

    if (!body.scanId) {
      return errorResponse("scanId is required.", 400, "invalid_request");
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);

    const { data: scanRow, error: scanLookupError } = await admin
      .from("scans")
      .select("id")
      .eq("id", body.scanId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (scanLookupError) {
      throw scanLookupError;
    }

    if (!scanRow) {
      return errorResponse("Scan not found.", 404, "scan_not_found");
    }

    const { data: inputRows, error: inputsError } = await admin
      .from("scan_inputs")
      .select("storage_path, thumbnail_storage_path")
      .eq("scan_id", body.scanId)
      .eq("user_id", user.id);

    if (inputsError) {
      throw inputsError;
    }

    const imageStoragePaths = Array.from(
      new Set(
        (inputRows ?? [])
          .flatMap((row) => [row.storage_path, row.thumbnail_storage_path])
          .filter((value): value is string =>
            typeof value === "string" && value.length > 0
          ),
      ),
    );

    const { error: scanDeleteError } = await admin.from("scans").delete().eq(
      "id",
      body.scanId,
    ).eq("user_id", user.id);
    if (scanDeleteError) {
      throw scanDeleteError;
    }

    if (imageStoragePaths.length) {
      const { error: imageDeleteError } = await admin.storage.from(
        mealImagesBucket,
      ).remove(imageStoragePaths);
      if (imageDeleteError) {
        console.warn(
          "[scan-delete] failed to remove scan image",
          imageDeleteError,
        );
      }
    }

    let learningSyncStatus: "queued" | "failed" = "queued";
    try {
      await enqueueLearningJob(admin, {
        userId: user.id,
        eventType: "scan_deleted",
        sourceType: "scan",
        sourceId: body.scanId,
      });
    } catch (error) {
      learningSyncStatus = "failed";
      await recordSystemEvent(admin, {
        eventType: "scan_delete_learning_job_enqueue_failed",
        severity: "error",
        userId: user.id,
        operation: "scan_delete",
        entityType: "scan",
        entityId: body.scanId,
        metadata: errorMetadata(error),
      });
    }

    try {
      await refreshUserAppSnapshot(admin, user.id, {
        sourceType: "scan",
        sourceId: body.scanId,
        learningStatus: learningSyncStatus === "queued" ? "pending" : "failed",
      });
    } catch (error) {
      await recordSystemEvent(admin, {
        eventType: "scan_delete_snapshot_refresh_failed",
        severity: "error",
        userId: user.id,
        operation: "scan_delete",
        entityType: "scan",
        entityId: body.scanId,
        metadata: errorMetadata(error),
      });
    }

    return jsonResponse({
      ok: true,
      scanId: body.scanId,
      learningSyncStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[scan-delete]", error);
    return errorResponse(
      "The scan could not be deleted.",
      500,
      "scan_delete_failed",
    );
  }
});

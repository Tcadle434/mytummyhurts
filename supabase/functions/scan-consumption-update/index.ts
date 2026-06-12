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

const CONSUMPTION_STATUSES = ["unknown", "consumed", "skipped"] as const;
type ConsumptionStatus = (typeof CONSUMPTION_STATUSES)[number];

function isConsumptionStatus(value: unknown): value is ConsumptionStatus {
  return CONSUMPTION_STATUSES.includes(value as ConsumptionStatus);
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, "method_not_allowed");
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{
      scanId?: string;
      consumptionStatus?: string;
      consumedMenuItemSourceIds?: string[];
    }>(request);

    if (!body.scanId) {
      return errorResponse("scanId is required.", 400, "invalid_request");
    }

    const consumedMenuItemSourceIds = (body.consumedMenuItemSourceIds ?? [])
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (!isConsumptionStatus(body.consumptionStatus) && consumedMenuItemSourceIds.length === 0) {
      return errorResponse(
        "consumptionStatus or consumedMenuItemSourceIds is required.",
        400,
        "invalid_request",
      );
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);

    const { data: scanRow, error: scanLookupError } = await admin
      .from("scans")
      .select("id, scan_category")
      .eq("id", body.scanId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (scanLookupError) {
      throw scanLookupError;
    }

    if (!scanRow) {
      return errorResponse("Scan not found.", 404, "scan_not_found");
    }

    // Confirming a menu dish implies the scan itself was consumed.
    const nextStatus: ConsumptionStatus | null = isConsumptionStatus(body.consumptionStatus)
      ? body.consumptionStatus
      : consumedMenuItemSourceIds.length > 0
      ? "consumed"
      : null;

    if (nextStatus) {
      const { error: scanUpdateError } = await admin
        .from("scans")
        .update({ consumption_status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", body.scanId)
        .eq("user_id", user.id);

      if (scanUpdateError) {
        throw scanUpdateError;
      }
    }

    if (consumedMenuItemSourceIds.length > 0) {
      const { error: menuItemError } = await admin
        .from("menu_items")
        .update({ consumed_at: new Date().toISOString() })
        .eq("scan_id", body.scanId)
        .eq("user_id", user.id)
        .in("source_item_id", consumedMenuItemSourceIds);

      if (menuItemError) {
        throw menuItemError;
      }
    }

    let learningSyncStatus: "queued" | "failed" = "queued";
    try {
      await enqueueLearningJob(admin, {
        userId: user.id,
        eventType: "scan_consumption_updated",
        sourceType: "scan",
        sourceId: body.scanId,
      });
    } catch (error) {
      learningSyncStatus = "failed";
      await recordSystemEvent(admin, {
        eventType: "consumption_learning_job_enqueue_failed",
        severity: "error",
        userId: user.id,
        operation: "scan_consumption_update",
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
        eventType: "consumption_snapshot_refresh_failed",
        severity: "error",
        userId: user.id,
        operation: "scan_consumption_update",
        entityType: "scan",
        entityId: body.scanId,
        metadata: errorMetadata(error),
      });
    }

    return jsonResponse({
      ok: true,
      consumptionStatus: nextStatus ?? "consumed",
      consumedMenuItemSourceIds,
      learningSyncStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[scan-consumption-update]", error);
    return errorResponse(
      "Consumption could not be saved.",
      500,
      "consumption_update_failed",
    );
  }
});

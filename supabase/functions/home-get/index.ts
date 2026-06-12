import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import {
  getUserAppSnapshot,
  refreshUserAppSnapshot,
} from "../_shared/appSnapshot.ts";
import { ensureUserRow } from "../_shared/db.ts";
import { requireEntitledUser } from "../_shared/entitlements.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
} from "../_shared/http.ts";
import { errorMetadata, recordSystemEvent } from "../_shared/observability.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, "method_not_allowed");
  }

  try {
    const user = await requireUser(request);
    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);

    let snapshot = await getUserAppSnapshot(admin, user.id);
    if (!snapshot) {
      snapshot = await refreshUserAppSnapshot(admin, user.id, {
        sourceType: "home_get",
        learningStatus: "idle",
        recomputed: true,
      });
    }

    return jsonResponse({
      ok: true,
      snapshotVersion: snapshot.snapshotVersion,
      profile: snapshot.homePayload.profile,
      billing: snapshot.homePayload.billing,
      recentScans: snapshot.homePayload.recentScans,
      dailyReports: snapshot.homePayload.dailyReports,
      insightSummary: snapshot.homePayload.insightSummary,
      learningStatus: snapshot.learningStatus,
      generatedAt: snapshot.generatedAt,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    try {
      await recordSystemEvent(createAdminClient(), {
        eventType: "home_snapshot_load_failed",
        severity: "error",
        operation: "home_get",
        metadata: errorMetadata(error),
      });
    } catch {
      // The typed client error below is more important than secondary logging.
    }

    console.error("[home-get]", error);
    return errorResponse(
      "Home data could not be loaded.",
      500,
      "home_snapshot_failed",
    );
  }
});

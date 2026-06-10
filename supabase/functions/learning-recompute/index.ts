import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
import {
  OperationLockBusyError,
  rebuildInsightsAndProfile,
} from "../_shared/profile.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

type LearningRecomputeSourceType = "daily_gut_report" | "scan" | "profile";

const validSourceTypes = new Set<LearningRecomputeSourceType>([
  "daily_gut_report",
  "scan",
  "profile",
]);

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
      sourceType?: LearningRecomputeSourceType;
      sourceId?: string;
      eventType?: string;
    }>(request);

    if (!body.sourceType || !validSourceTypes.has(body.sourceType)) {
      return errorResponse(
        "sourceType is required.",
        400,
        "invalid_source_type",
      );
    }

    if (body.sourceType !== "profile" && !body.sourceId) {
      return errorResponse("sourceId is required.", 400, "invalid_source_id");
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);
    const result = await rebuildInsightsAndProfile(admin, user.id, {
      eventType: body.eventType ?? "score_recomputed",
      sourceType: body.sourceType === "profile" ? "profile" : body.sourceType,
      sourceId: body.sourceId,
      skipIfLocked: true,
    });

    return jsonResponse({
      ok: true,
      learningSyncStatus: "updated",
      profile: result.profile,
      insights: result.insights,
      conditionInsights: result.conditionInsights,
      dailyReports: result.dailyReports,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof OperationLockBusyError) {
      return jsonResponse({
        ok: true,
        learningSyncStatus: "locked",
      });
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[learning-recompute]", error);
    return jsonResponse({
      ok: true,
      learningSyncStatus: "failed",
    });
  }
});

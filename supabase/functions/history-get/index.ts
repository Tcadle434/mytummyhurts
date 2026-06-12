import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { ensureUserRow, getPaginatedScanHistory } from "../_shared/db.ts";
import { requireEntitledUser } from "../_shared/entitlements.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

function scanCategory(value: unknown) {
  return value === "food" || value === "menu" || value === "grocery"
    ? value
    : undefined;
}

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
    const body = request.method === "POST"
      ? await readJsonBody<
        {
          page?: number;
          pageSize?: number;
          includeDailyReports?: boolean;
          scanCategory?: string;
        }
      >(request)
      : {};
    const history = await getPaginatedScanHistory(admin, user.id, {
      ...body,
      scanCategory: scanCategory(body.scanCategory),
    });
    return jsonResponse({
      page: history.page,
      pageSize: history.pageSize,
      hasMore: history.hasMore,
      scans: history.scans,
      ...(history.dailyReports ? { dailyReports: history.dailyReports } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[history-get]", error);
    return errorResponse("History could not be loaded.", 500, "history_failed");
  }
});

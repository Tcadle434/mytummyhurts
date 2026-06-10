import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { ensureUserRow, getScanById } from "../_shared/db.ts";
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
    const scan = await getScanById(admin, body.scanId, user.id);

    if (scan.analysisStatus === "failed") {
      return errorResponse("Scan not found.", 404, "scan_not_found");
    }

    return jsonResponse({
      ok: true,
      scan,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof Error && error.message === "scan_not_found") {
      return errorResponse("Scan not found.", 404, "scan_not_found");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[scan-get]", error);
    return errorResponse("Scan could not be loaded.", 500, "scan_get_failed");
  }
});

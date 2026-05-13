import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getPaginatedScanHistory } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    const body = request.method === 'POST' ? await readJsonBody<{ page?: number; pageSize?: number }>(request) : {};
    const history = await getPaginatedScanHistory(admin, user.id, body);
    return jsonResponse({
      page: history.page,
      pageSize: history.pageSize,
      hasMore: history.hasMore,
      scans: history.scans,
      dailyReports: history.dailyReports,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[history-get]', error);
    return errorResponse('History could not be loaded.', 500, 'history_failed');
  }
});

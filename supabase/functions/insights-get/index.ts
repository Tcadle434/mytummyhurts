import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getBillingState, getConditionIngredientInsights, getInsights, getProfile } from '../_shared/db.ts';
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
    const body = request.method === 'POST' ? await readJsonBody<{ search?: string; limit?: number }>(request) : {};

    const [profile, insights, conditionInsights, billing] = await Promise.all([
      getProfile(admin, user.id),
      getInsights(admin, user.id, { search: body.search, limit: body.limit }),
      getConditionIngredientInsights(admin, user.id, { search: body.search, limit: body.limit }),
      getBillingState(admin, user.id),
    ]);

    return jsonResponse({
      profile,
      insights,
      conditionInsights,
      billing,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[insights-get]', error);
    return errorResponse('Insights could not be loaded.', 500, 'insights_failed');
  }
});

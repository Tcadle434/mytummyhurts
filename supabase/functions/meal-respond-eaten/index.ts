import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getMealById } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{ mealId?: string; didUserEat?: boolean }>(request);
    if (!body.mealId || typeof body.didUserEat !== 'boolean') {
      return errorResponse('mealId and didUserEat are required.', 400, 'invalid_request');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { error } = await admin
      .from('meals')
      .update({
        did_user_eat: body.didUserEat,
        followup_state: body.didUserEat ? 'answered_yes' : 'answered_no',
        followup_due_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.mealId)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    const meal = await getMealById(admin, body.mealId);
    return jsonResponse({ ok: true, meal });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[meal-respond-eaten]', error);
    return errorResponse('The follow-up response could not be saved.', 500, 'meal_update_failed');
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getMealById } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
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
    const body = await readJsonBody<{
      mealId?: string;
      severity?: 'felt_good' | 'mild' | 'moderate' | 'severe';
      symptomTags?: string[];
      otherText?: string;
      eatenTimeBucket?: string;
    }>(request);

    if (!body.mealId || !body.severity) {
      return errorResponse('mealId and severity are required.', 400, 'invalid_request');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { error: mealError } = await admin
      .from('meals')
      .update({
        did_user_eat: true,
        eaten_time_bucket: body.eatenTimeBucket ?? 'just_now',
        followup_state: 'answered_yes',
        followup_due_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.mealId)
      .eq('user_id', user.id);

    if (mealError) {
      throw mealError;
    }

    const { error: symptomError } = await admin.from('meal_symptoms').insert({
      meal_id: body.mealId,
      severity: body.severity,
      symptom_tags: body.symptomTags ?? [],
      other_text: body.otherText ?? null,
    });

    if (symptomError) {
      throw symptomError;
    }

    const [{ profile, insights }, meal] = await Promise.all([
      rebuildInsightsAndProfile(admin, user.id),
      getMealById(admin, body.mealId),
    ]);

    return jsonResponse({
      ok: true,
      meal,
      profile,
      insights,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[meal-log-symptoms]', error);
    return errorResponse('Symptoms could not be saved.', 500, 'symptom_save_failed');
  }
});

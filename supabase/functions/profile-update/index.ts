import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getBillingState } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

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
      onboardingAnswers?: {
        conditions?: string[];
        customConditions?: string[];
        ingredientSensitivities?: string[];
        customIngredientSensitivities?: string[];
        symptoms?: string[];
        symptomFrequency?: string;
        symptomSeverityBaseline?: string;
        mealContexts?: string[];
        motivation?: string;
      };
      knownConditions?: string[];
      knownIngredientSensitivities?: string[];
      commonSymptoms?: string[];
      symptomFrequency?: string;
      symptomSeverityBaseline?: string;
      mealContexts?: string[];
      motivation?: string;
    }>(request);

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { data: existingRow, error: existingError } = await admin
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingError) {
      throw existingError;
    }

    const onboardingAnswers = body.onboardingAnswers;
    const knownConditions = onboardingAnswers
      ? unique([...(onboardingAnswers.conditions ?? []), ...(onboardingAnswers.customConditions ?? [])])
      : unique(body.knownConditions ?? existingRow.known_conditions ?? []);
    const knownIngredientSensitivities = onboardingAnswers
      ? unique([
          ...(onboardingAnswers.ingredientSensitivities ?? []),
          ...(onboardingAnswers.customIngredientSensitivities ?? []),
        ])
      : unique(body.knownIngredientSensitivities ?? existingRow.known_ingredient_sensitivities ?? []);
    const commonSymptoms = onboardingAnswers
      ? unique(onboardingAnswers.symptoms ?? [])
      : unique(body.commonSymptoms ?? existingRow.common_symptoms ?? []);
    const mealContexts = onboardingAnswers
      ? unique(onboardingAnswers.mealContexts ?? [])
      : unique(body.mealContexts ?? existingRow.meal_contexts ?? []);

    const { error: upsertError } = await admin.from('user_profiles').upsert(
      {
        user_id: user.id,
        known_conditions: knownConditions,
        known_ingredient_sensitivities: knownIngredientSensitivities,
        common_symptoms: commonSymptoms,
        symptom_frequency: onboardingAnswers?.symptomFrequency ?? body.symptomFrequency ?? existingRow.symptom_frequency ?? null,
        symptom_severity_baseline:
          onboardingAnswers?.symptomSeverityBaseline ??
          body.symptomSeverityBaseline ??
          existingRow.symptom_severity_baseline ??
          null,
        meal_contexts: mealContexts,
        motivation: onboardingAnswers?.motivation ?? body.motivation ?? existingRow.motivation ?? null,
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      throw upsertError;
    }

    const [{ profile, insights }, billing] = await Promise.all([
      rebuildInsightsAndProfile(admin, user.id),
      getBillingState(admin, user.id),
    ]);

    return jsonResponse({
      ok: true,
      profile,
      insights,
      billing,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[profile-update]', error);
    return errorResponse('Profile changes could not be saved.', 500, 'profile_update_failed');
  }
});

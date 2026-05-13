import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getBillingState } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
        displayName?: string | null;
        conditions?: string[];
        customConditions?: string[];
        ingredientSensitivities?: string[];
        customIngredientSensitivities?: string[];
        symptoms?: string[];
        customSymptoms?: string[];
        symptomFrequency?: string;
        symptomSeverityBaseline?: string;
        mealContexts?: string[];
        motivation?: string;
        currentEatingPatterns?: string[];
        lifestyleFactors?: string[];
        favoriteFoodsToReintroduce?: string;
      };
      displayName?: string | null;
      knownConditions?: string[];
      knownIngredientSensitivities?: string[];
      commonSymptoms?: string[];
      symptomFrequency?: string;
      symptomSeverityBaseline?: string;
      mealContexts?: string[];
      motivation?: string;
      currentEatingPatterns?: string[];
      lifestyleFactors?: string[];
      foodsToReintroduce?: string[];
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
      ? unique([...(onboardingAnswers.symptoms ?? []), ...(onboardingAnswers.customSymptoms ?? [])])
      : unique(body.commonSymptoms ?? existingRow.common_symptoms ?? []);
    const mealContexts = onboardingAnswers
      ? unique(onboardingAnswers.mealContexts ?? [])
      : unique(body.mealContexts ?? existingRow.meal_contexts ?? []);
    const currentEatingPatterns = onboardingAnswers
      ? unique(onboardingAnswers.currentEatingPatterns ?? [])
      : unique(body.currentEatingPatterns ?? existingRow.current_eating_patterns ?? []);
    const lifestyleFactors = onboardingAnswers
      ? unique(onboardingAnswers.lifestyleFactors ?? [])
      : unique(body.lifestyleFactors ?? existingRow.lifestyle_factors ?? []);
    const foodsToReintroduce = onboardingAnswers
      ? unique(String(onboardingAnswers.favoriteFoodsToReintroduce ?? '').split(/[\n,]/))
      : unique(body.foodsToReintroduce ?? existingRow.foods_to_reintroduce ?? []);
    const displayName = onboardingAnswers
      ? normalizeOptionalText(onboardingAnswers.displayName)
      : normalizeOptionalText(body.displayName ?? existingRow.display_name ?? null);

    const { error: upsertError } = await admin.from('user_profiles').upsert(
      {
        user_id: user.id,
        display_name: displayName,
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
        current_eating_patterns: currentEatingPatterns,
        lifestyle_factors: lifestyleFactors,
        foods_to_reintroduce: foodsToReintroduce,
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      throw upsertError;
    }

    if (foodsToReintroduce.length > 0) {
      const { data: existingTrials, error: trialLookupError } = await admin
        .from('reintroduction_trials')
        .select('target_food, ingredient_name')
        .eq('user_id', user.id);

      if (trialLookupError) {
        throw trialLookupError;
      }

      const existingTrialKeys = new Set(
        (existingTrials ?? []).map((trial) => normalizeOptionalText(trial.target_food ?? trial.ingredient_name) ?? ''),
      );
      const newTrials = foodsToReintroduce
        .filter((food) => !existingTrialKeys.has(food))
        .map((food) => ({
          user_id: user.id,
          ingredient_name: food,
          target_food: food,
          status: 'planned',
        }));

      if (newTrials.length > 0) {
        const { error: trialInsertError } = await admin.from('reintroduction_trials').insert(newTrials);
        if (trialInsertError) {
          throw trialInsertError;
        }
      }
    }

    const [{ profile, insights, conditionInsights }, billing] = await Promise.all([
      rebuildInsightsAndProfile(admin, user.id, {
        eventType: onboardingAnswers ? 'onboarding_profile_created' : 'profile_updated',
        sourceType: 'profile',
      }),
      getBillingState(admin, user.id),
    ]);

    return jsonResponse({
      ok: true,
      profile,
      insights,
      conditionInsights,
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

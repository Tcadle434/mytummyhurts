import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import { IngredientInsight, UserProfile } from './domain.ts';
import { buildUserProfileFromSeed, recomputeInsights } from './scoring.ts';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry)).filter(Boolean);
}

export async function rebuildInsightsAndProfile(admin: SupabaseClient, userId: string): Promise<{
  insights: IngredientInsight[];
  profile: UserProfile;
}> {
  const [
    { data: profileRow, error: profileError },
    { data: scanRows, error: scansError },
    { data: mealRows, error: mealsError },
  ] = await Promise.all([
    admin.from('user_profiles').select('*').eq('user_id', userId).single(),
    admin.from('scans').select('id, structured_analysis').eq('user_id', userId),
    admin.from('meals').select('id, scan_id, did_user_eat').eq('user_id', userId),
  ]);

  if (profileError) {
    throw profileError;
  }

  if (scansError) {
    throw scansError;
  }

  if (mealsError) {
    throw mealsError;
  }

  const mealIds = (mealRows ?? []).map((meal) => meal.id);
  const { data: symptomRows, error: symptomsError } = mealIds.length
    ? await admin.from('meal_symptoms').select('id, meal_id, severity, symptom_tags').in('meal_id', mealIds)
    : { data: [], error: null };

  if (symptomsError) {
    throw symptomsError;
  }

  const insights = recomputeInsights(
    (scanRows ?? []).map((scan) => ({
      id: scan.id,
      structuredAnalysis: {
        ingredients: Array.isArray((scan.structured_analysis as Record<string, unknown> | null)?.ingredients)
          ? (((scan.structured_analysis as Record<string, unknown>).ingredients as Array<Record<string, unknown>>).map(
              (ingredient) => ({
                name: String(ingredient.name ?? ''),
                confidence:
                  ingredient.confidence === 'high' || ingredient.confidence === 'low' ? ingredient.confidence : 'medium',
              }),
            ))
          : [],
      },
    })),
    (mealRows ?? []).map((meal) => ({
      id: meal.id,
      scanId: meal.scan_id,
      didUserEat: meal.did_user_eat,
    })),
    (symptomRows ?? []).map((symptom) => ({
      mealId: symptom.meal_id,
      severity: symptom.severity,
      symptomTags: asStringArray(symptom.symptom_tags),
    })),
  );

  await admin.from('ingredient_insights').delete().eq('user_id', userId);

  if (insights.length > 0) {
    const { error: insertError } = await admin.from('ingredient_insights').insert(
      insights.map((insight) => ({
        user_id: userId,
        ingredient_name: insight.ingredientName,
        trigger_score: insight.triggerScore,
        safe_score: insight.safeScore,
        pattern_strength: insight.patternStrength,
        linked_conditions: insight.linkedConditions,
        supporting_evidence_count: insight.supportingEvidenceCount,
        last_recomputed_at: insight.lastRecomputedAt,
      })),
    );

    if (insertError) {
      throw insertError;
    }
  }

  const confirmedMealCount = (mealRows ?? []).filter((meal) => meal.did_user_eat === true).length;
  const profile = buildUserProfileFromSeed(
    {
      userId,
      knownConditions: asStringArray(profileRow.known_conditions),
      knownIngredientSensitivities: asStringArray(profileRow.known_ingredient_sensitivities),
      commonSymptoms: asStringArray(profileRow.common_symptoms),
      symptomFrequency: profileRow.symptom_frequency ?? undefined,
      symptomSeverityBaseline: profileRow.symptom_severity_baseline ?? undefined,
      mealContexts: asStringArray(profileRow.meal_contexts),
      motivation: profileRow.motivation ?? undefined,
    },
    insights,
    {
      priorStomachProfile: profileRow.stomach_profile_blob ?? undefined,
      confirmedMealCount,
    },
  );

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({
      stomach_profile_blob: profile.stomachProfile,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  return { insights, profile };
}

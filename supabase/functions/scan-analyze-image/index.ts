import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { createSignedStorageUrl, ensureUserRow, getBillingState, getInsights, getMealById, getProfile, getScanById } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { extractMealFromImage } from '../_shared/openai.ts';
import { computeScanResultFromStructured } from '../_shared/scoring.ts';
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
    const body = await readJsonBody<{ imagePath?: string; sourceType?: string }>(request);
    const admin = createAdminClient();

    await ensureUserRow(admin, user);

    const [profile, insights] = await Promise.all([getProfile(admin, user.id), getInsights(admin, user.id)]);
    const signedImageUrl = await createSignedStorageUrl(admin, body.imagePath);
    const extraction = await extractMealFromImage(signedImageUrl, {
      knownConditions: profile?.knownConditions ?? [],
      knownIngredients: profile?.knownIngredientSensitivities ?? [],
    });

    if (extraction.clarity === 'unclear' || extraction.ingredients.length === 0) {
      return errorResponse(
        'The meal could not be analyzed clearly. Try retaking the photo with the full meal visible.',
        422,
        'unclear_image',
        { reason: extraction.unclearReason ?? null },
      );
    }

    const result = computeScanResultFromStructured(
      {
        dishName: extraction.dishName,
        ingredients: extraction.ingredients,
        prepStyle: extraction.prepStyle,
        notes: extraction.notes,
      },
      profile,
      insights,
      signedImageUrl ?? undefined,
    );

    const { data, error } = await admin.rpc('complete_scan_analysis', {
      p_user_id: user.id,
      p_source_type: body.sourceType ?? 'camera',
      p_image_storage_path: body.imagePath ?? null,
      p_input_text: null,
      p_dish_name: result.dishName,
      p_overall_risk_score: result.overallRiskScore,
      p_overall_risk_level: result.overallRiskLevel,
      p_condition_risk_scores: result.conditionRiskScores,
      p_possible_triggers: result.possibleTriggers,
      p_structured_analysis: {
        ...result.structuredAnalysis,
        interpretation: result.interpretation,
      },
      p_followup_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      p_meal_origin: body.sourceType ?? 'camera',
    });

    if (error) {
      const message = String(error.message ?? '');
      if (message.includes('subscription_required')) {
        return errorResponse('A subscription is required before running scans.', 402, 'subscription_required');
      }

      if (message.includes('insufficient_tokens')) {
        return errorResponse('You are out of scan tokens.', 402, 'token_exhausted');
      }

      throw error;
    }

    const finalized = data?.[0];
    if (!finalized) {
      throw new Error('missing_scan_result');
    }

    const [scan, meal, billing] = await Promise.all([
      getScanById(admin, finalized.scan_id),
      getMealById(admin, finalized.meal_id),
      getBillingState(admin, user.id),
    ]);

    return jsonResponse({
      scanId: finalized.scan_id,
      mealId: finalized.meal_id,
      tokensRemaining: finalized.tokens_remaining,
      scan,
      meal,
      billing,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[scan-analyze-image]', error);
    return errorResponse('The meal could not be analyzed.', 500, 'analysis_failed');
  }
});

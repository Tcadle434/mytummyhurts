import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getBillingState, getInsights, getProfile, getScanById } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { extractMealFromText } from '../_shared/openai.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
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
    const body = await readJsonBody<{ text?: string; sourceType?: string; scanCategory?: string; localDate?: string; timezone?: string }>(request);
    if (!body.text?.trim()) {
      return errorResponse('A meal description is required.', 400, 'missing_text');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const [profile, insights] = await Promise.all([getProfile(admin, user.id), getInsights(admin, user.id)]);
    const extraction = await extractMealFromText(body.text, {
      knownConditions: profile?.knownConditions ?? [],
      knownIngredients: profile?.knownIngredientSensitivities ?? [],
    });
    const normalizedIngredients = [...extraction.visibleIngredients, ...extraction.inferredIngredients];

    if (extraction.clarity === 'unclear' || normalizedIngredients.length === 0) {
      return errorResponse(
        'The meal description could not be understood clearly. Try being more specific about the dish and major ingredients.',
        422,
        'unclear_meal_description',
      );
    }

    const result = computeScanResultFromStructured(extraction, profile, insights);

    const { data, error } = await admin.rpc('complete_scan_analysis', {
      p_user_id: user.id,
      p_source_type: body.sourceType ?? 'manual_text',
      p_image_storage_path: null,
      p_input_text: body.text,
      p_dish_name: result.dishName,
      p_overall_risk_score: result.overallRiskScore,
      p_overall_risk_level: result.overallRiskLevel,
      p_condition_risk_scores: result.conditionRiskScores,
      p_possible_triggers: result.possibleTriggers,
      p_structured_analysis: {
        ...result.structuredAnalysis,
        interpretation: result.interpretation,
        gutScoreImpact: result.gutScoreImpact,
      },
      p_scan_ingredients: normalizedIngredients.map((ingredient, index) => ({
        raw_name: ingredient.rawName,
        canonical_name: ingredient.canonicalName,
        confidence: ingredient.confidence,
        evidence: ingredient.evidence,
        component_name: ingredient.component ?? null,
        display_order: index,
      })),
      p_extraction_model: result.structuredAnalysis.model,
      p_extraction_prompt_version: result.structuredAnalysis.promptVersion,
      p_extraction_clarity: result.structuredAnalysis.clarity,
      p_extraction_unclear_reason: result.structuredAnalysis.unclearReason ?? null,
      p_dish_confidence: result.structuredAnalysis.dishConfidence,
      p_scan_category: body.scanCategory ?? 'food',
      p_local_date: body.localDate ?? null,
      p_timezone: body.timezone ?? null,
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

    const scanCategory = body.scanCategory ?? 'food';
    const learning = scanCategory === 'food'
      ? await rebuildInsightsAndProfile(admin, user.id, {
          eventType: 'scan_completed',
          sourceType: 'scan',
          sourceId: String(finalized.scan_id),
        })
      : null;

    const [scan, billing] = await Promise.all([
      getScanById(admin, finalized.scan_id),
      getBillingState(admin, user.id),
    ]);

    return jsonResponse({
      scanId: finalized.scan_id,
      tokensRemaining: finalized.tokens_remaining,
      scan,
      billing,
      ...(learning
        ? {
            profile: learning.profile,
            insights: learning.insights,
            conditionInsights: learning.conditionInsights,
          }
        : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[scan-analyze-text]', error);
    return errorResponse('The meal description could not be analyzed.', 500, 'analysis_failed');
  }
});

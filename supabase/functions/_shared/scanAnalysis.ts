import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  beginScanAnalysis,
  completeReservedScanAnalysis,
  createSignedStorageUrl,
  failReservedScanAnalysis,
  getBillingState,
  getConditionIngredientInsights,
  getInsights,
  getProfile,
  getScanById,
} from './db.ts';
import { ApiError } from './http.ts';
import { errorMetadata, recordSystemEvent } from './observability.ts';
import { extractMealFromImage, extractMealFromText } from './openai.ts';
import { OperationLockBusyError, rebuildInsightsAndProfile } from './profile.ts';
import { computeScanResultFromStructured } from './scoring.ts';

type ScanAnalyzeBody = {
  requestId?: string;
  sourceType?: string;
  scanCategory?: string;
  localDate?: string;
  timezone?: string;
};

type AnalyzeReservedScanOptions =
  | {
      kind: 'image';
      imagePath?: string;
      body: ScanAnalyzeBody;
    }
  | {
      kind: 'text';
      text?: string;
      body: ScanAnalyzeBody;
    };

function normalizeRequestId(value: string | undefined) {
  const requestId = value?.trim();
  if (!requestId) {
    throw new ApiError('A scan request id is required.', 400, 'missing_request_id');
  }

  if (requestId.length > 128) {
    throw new ApiError('The scan request id is too long.', 400, 'invalid_request_id');
  }

  return requestId;
}

function normalizeScanCategory(value: string | undefined) {
  return value === 'menu' || value === 'grocery' ? value : 'food';
}

function errorFromReservationFailure(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('subscription_required')) {
    return new ApiError('A subscription is required before running scans.', 402, 'subscription_required');
  }

  if (message.includes('insufficient_tokens')) {
    return new ApiError('You are out of scan tokens.', 402, 'token_exhausted');
  }

  if (message.includes('invalid_request_id')) {
    return new ApiError('A valid scan request id is required.', 400, 'invalid_request_id');
  }

  return error instanceof ApiError
    ? error
    : new ApiError('The scan could not be reserved.', 500, 'scan_reservation_failed');
}

function errorFromExistingFailure(code: string | undefined, message: string | undefined, requestId: string) {
  return new ApiError(message || 'This scan request already failed.', 422, code || 'scan_failed', { requestId });
}

async function fetchLearningState(admin: SupabaseClient, userId: string) {
  const [profile, insights, conditionInsights] = await Promise.all([
    getProfile(admin, userId),
    getInsights(admin, userId),
    getConditionIngredientInsights(admin, userId),
  ]);

  return { profile, insights, conditionInsights };
}

async function buildCompletedResponse(
  admin: SupabaseClient,
  params: {
    userId: string;
    scanId: string;
    requestId: string;
    deduped: boolean;
    learningSyncStatus: 'updated' | 'locked' | 'failed' | 'skipped' | 'not_applicable';
  },
) {
  const [scan, billing] = await Promise.all([
    getScanById(admin, params.scanId),
    getBillingState(admin, params.userId),
  ]);

  const learning =
    scan.scanCategory === 'food'
      ? await fetchLearningState(admin, params.userId)
      : null;

  return {
    scanId: params.scanId,
    requestId: params.requestId,
    deduped: params.deduped,
    learningSyncStatus: params.learningSyncStatus,
    tokensRemaining: billing.tokensRemaining,
    scan,
    billing,
    ...(learning ?? {}),
  };
}

export async function analyzeReservedScan(
  admin: SupabaseClient,
  user: { id: string },
  options: AnalyzeReservedScanOptions,
) {
  const requestId = normalizeRequestId(options.body.requestId);
  const scanCategory = normalizeScanCategory(options.body.scanCategory);
  const sourceType = options.body.sourceType ?? (options.kind === 'image' ? 'camera' : 'manual_text');
  const inputText = options.kind === 'text' ? options.text?.trim() : null;
  let reservation;

  if (options.kind === 'text' && !inputText) {
    throw new ApiError('A meal description is required.', 400, 'missing_text');
  }

  let scanCompleted = false;

  try {
    reservation = await beginScanAnalysis(admin, {
      userId: user.id,
      requestId,
      sourceType,
      imageStoragePath: options.kind === 'image' ? options.imagePath ?? null : null,
      inputText,
      scanCategory,
      localDate: options.body.localDate ?? null,
      timezone: options.body.timezone ?? null,
    });
  } catch (error) {
    throw errorFromReservationFailure(error);
  }

  await recordSystemEvent(admin, {
    eventType: 'scan_reservation_checked',
    userId: user.id,
    operation: 'scan_analysis',
    entityType: 'scan',
    entityId: reservation.scanId,
    requestId,
    metadata: {
      requestStatus: reservation.requestStatus,
      analysisStatus: reservation.analysisStatus,
      scanCategory,
      sourceType,
      tokensRemaining: reservation.tokensRemaining,
    },
  });

  if (reservation.requestStatus === 'completed_existing') {
    return buildCompletedResponse(admin, {
      userId: user.id,
      scanId: reservation.scanId,
      requestId,
      deduped: true,
      learningSyncStatus: 'skipped',
    });
  }

  if (reservation.requestStatus === 'processing_existing') {
    throw new ApiError('That scan is already being analyzed.', 409, 'scan_in_progress', {
      requestId,
      scanId: reservation.scanId,
    });
  }

  if (reservation.requestStatus === 'failed_existing') {
    throw errorFromExistingFailure(reservation.errorCode, reservation.errorMessage, requestId);
  }

  try {
    const [profile, insights] = await Promise.all([getProfile(admin, user.id), getInsights(admin, user.id)]);
    const extraction =
      options.kind === 'image'
        ? await extractMealFromImage(await createRequiredSignedImageUrl(admin, options.imagePath), {
            knownConditions: profile?.knownConditions ?? [],
            knownIngredients: profile?.knownIngredientSensitivities ?? [],
          })
        : await extractMealFromText(inputText!, {
            knownConditions: profile?.knownConditions ?? [],
            knownIngredients: profile?.knownIngredientSensitivities ?? [],
          });

    const normalizedIngredients = [...extraction.visibleIngredients, ...extraction.inferredIngredients];
    if (extraction.clarity === 'unclear' || normalizedIngredients.length === 0) {
      const code = options.kind === 'image' ? 'unclear_image' : 'unclear_meal_description';
      const message =
        options.kind === 'image'
          ? 'The meal could not be analyzed clearly. Try retaking the photo with the full meal visible.'
          : 'The meal description could not be understood clearly. Try being more specific about the dish and major ingredients.';
      throw new ApiError(message, 422, code, { reason: extraction.unclearReason ?? null });
    }

    const result = computeScanResultFromStructured(
      extraction,
      profile,
      insights,
      options.kind === 'image' ? await createSignedStorageUrl(admin, options.imagePath) ?? undefined : undefined,
    );

    const finalized = await completeReservedScanAnalysis(admin, {
      userId: user.id,
      scanId: reservation.scanId,
      dishName: result.dishName,
      overallRiskScore: result.overallRiskScore,
      overallRiskLevel: result.overallRiskLevel,
      conditionRiskScores: result.conditionRiskScores,
      possibleTriggers: result.possibleTriggers,
      structuredAnalysis: {
        ...result.structuredAnalysis,
        interpretation: result.interpretation,
        gutScoreImpact: result.gutScoreImpact,
      },
      scanIngredients: normalizedIngredients.map((ingredient, index) => ({
        raw_name: ingredient.rawName,
        canonical_name: ingredient.canonicalName,
        confidence: ingredient.confidence,
        evidence: ingredient.evidence,
        component_name: ingredient.component ?? null,
        display_order: index,
      })),
      extractionModel: result.structuredAnalysis.model,
      extractionPromptVersion: result.structuredAnalysis.promptVersion,
      extractionClarity: result.structuredAnalysis.clarity,
      extractionUnclearReason: result.structuredAnalysis.unclearReason ?? null,
      dishConfidence: result.structuredAnalysis.dishConfidence,
    });
    scanCompleted = true;

    let learningSyncStatus: 'updated' | 'locked' | 'failed' | 'not_applicable' =
      scanCategory === 'food' ? 'updated' : 'not_applicable';

    if (scanCategory === 'food') {
      try {
        await rebuildInsightsAndProfile(admin, user.id, {
          eventType: 'scan_completed',
          sourceType: 'scan',
          sourceId: finalized.scanId,
        });
      } catch (error) {
        learningSyncStatus = error instanceof OperationLockBusyError ? 'locked' : 'failed';
        await recordSystemEvent(admin, {
          eventType: 'scan_learning_recompute_failed',
          severity: error instanceof OperationLockBusyError ? 'warn' : 'error',
          userId: user.id,
          operation: 'scan_analysis',
          entityType: 'scan',
          entityId: finalized.scanId,
          requestId,
          metadata: errorMetadata(error),
        });
      }
    }

    await recordSystemEvent(admin, {
      eventType: 'scan_analysis_completed',
      userId: user.id,
      operation: 'scan_analysis',
      entityType: 'scan',
      entityId: finalized.scanId,
      requestId,
      metadata: {
        scanCategory,
        sourceType,
        tokensRemaining: finalized.tokensRemaining,
        learningSyncStatus,
      },
    });

    return buildCompletedResponse(admin, {
      userId: user.id,
      scanId: finalized.scanId,
      requestId,
      deduped: false,
      learningSyncStatus,
    });
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError('The meal could not be analyzed.', 500, 'analysis_failed', errorMetadata(error));

    if (scanCompleted) {
      await recordSystemEvent(admin, {
        eventType: 'scan_post_completion_response_failed',
        severity: 'error',
        userId: user.id,
        operation: 'scan_analysis',
        entityType: 'scan',
        entityId: reservation.scanId,
        requestId,
        metadata: {
          code: apiError.code,
          status: apiError.status,
          ...apiError.details,
        },
      });
      throw apiError;
    }

    const failure = await failReservedScanAnalysis(admin, {
      userId: user.id,
      scanId: reservation.scanId,
      errorCode: apiError.code,
      errorMessage: apiError.message,
      refund: true,
    });

    await recordSystemEvent(admin, {
      eventType: 'scan_analysis_failed',
      severity: apiError.status >= 500 ? 'error' : 'warn',
      userId: user.id,
      operation: 'scan_analysis',
      entityType: 'scan',
      entityId: reservation.scanId,
      requestId,
      metadata: {
        ...apiError.details,
        code: apiError.code,
        status: apiError.status,
        refunded: failure.refunded,
        tokensRemaining: failure.tokensRemaining,
      },
    });

    throw apiError;
  }
}

async function createRequiredSignedImageUrl(admin: SupabaseClient, imagePath: string | undefined) {
  if (!imagePath) {
    throw new ApiError('A meal image is required.', 400, 'missing_image');
  }

  const signedUrl = await createSignedStorageUrl(admin, imagePath);
  if (!signedUrl) {
    throw new ApiError('The meal image could not be loaded.', 500, 'image_unavailable');
  }

  return signedUrl;
}

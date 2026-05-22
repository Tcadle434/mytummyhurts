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
  recordScanAiAuditLogs,
} from './db.ts';
import { ApiError } from './http.ts';
import { inlineImageDataUrlByteLength, normalizeInlineImageDataUrl } from './imageData.ts';
import { errorMetadata, recordSystemEvent } from './observability.ts';
import { extractMealFromImageWithAudit, extractMealFromTextWithAudit, extractMenuFromImagesWithAudit } from './openai.ts';
import { OperationLockBusyError, rebuildInsightsAndProfile } from './profile.ts';
import { computeMenuScanResultFromExtraction, computeScanResultFromStructured } from './scoring.ts';

type ScanAnalyzeBody = {
  requestId?: string;
  sourceType?: string;
  scanCategory?: string;
  localDate?: string;
  timezone?: string;
  imagePaths?: string[];
  imageDataUrl?: string;
  imageDataUrls?: string[];
};

type AnalyzeReservedScanOptions =
  | {
      kind: 'image';
      imagePath?: string;
      imagePaths?: string[];
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

function normalizeImagePaths(options: Extract<AnalyzeReservedScanOptions, { kind: 'image' }>) {
  const paths = [
    ...(Array.isArray(options.imagePaths) ? options.imagePaths : []),
    ...(Array.isArray(options.body.imagePaths) ? options.body.imagePaths : []),
    options.imagePath,
  ]
    .map((path) => path?.trim())
    .filter((path): path is string => Boolean(path));

  return Array.from(new Set(paths));
}

function normalizeImageDataUrls(options: Extract<AnalyzeReservedScanOptions, { kind: 'image' }>) {
  const dataUrls = [
    ...(Array.isArray(options.body.imageDataUrls) ? options.body.imageDataUrls : []),
    options.body.imageDataUrl,
  ]
    .map((value) => normalizeInlineImageDataUrl(value))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(dataUrls));
}

function buildInputRefs(params: {
  kind: AnalyzeReservedScanOptions['kind'];
  scanCategory: string;
  inputText?: string | null;
  imagePaths: string[];
  imageDataUrls: string[];
}) {
  if (params.kind === 'text') {
    return [
      {
        input_kind: 'text',
        text_value: params.inputText ?? '',
        page_index: 0,
        metadata: {},
      },
    ];
  }

  const count = Math.max(params.imagePaths.length, params.imageDataUrls.length);
  return Array.from({ length: count }).map((_, index) => ({
    input_kind: 'image',
    image_role: params.scanCategory === 'menu' ? 'menu_page' : params.scanCategory === 'grocery' ? 'product_front' : 'meal',
    storage_path: params.imagePaths[index] ?? null,
    page_index: index,
    byte_size: params.imageDataUrls[index] ? inlineImageDataUrlByteLength(params.imageDataUrls[index]) : null,
    metadata: {
      inlineImageProvided: Boolean(params.imageDataUrls[index]),
      storagePathProvided: Boolean(params.imagePaths[index]),
    },
  }));
}

function conditionRiskPayload(result: ReturnType<typeof computeScanResultFromStructured>) {
  return result.conditionRisks.map((risk) => ({
    condition_name: risk.conditionName,
    risk_score: risk.riskScore,
    risk_level: risk.riskLevel,
    reason: risk.reason,
    display_order: risk.displayOrder,
  }));
}

function ingredientRiskPayload(result: ReturnType<typeof computeScanResultFromStructured>) {
  return result.ingredientRisks.map((ingredient) => ({
    menu_item_source_id: ingredient.menuItemSourceId ?? null,
    raw_name: ingredient.rawName,
    canonical_name: ingredient.canonicalName,
    risk_score: ingredient.riskScore,
    risk_level: ingredient.riskLevel,
    evidence: ingredient.evidence,
    confidence: ingredient.confidence,
    component_name: ingredient.componentName ?? null,
    reason: ingredient.reason,
    display_order: ingredient.displayOrder,
  }));
}

function menuResultPayload(result: ReturnType<typeof computeMenuScanResultFromExtraction>) {
  const menu = result.menuResult;
  if (!menu) {
    return { menuItems: [], ingredientRisks: [] };
  }

  const items = menu.items.length
    ? menu.items
    : [...menu.bestForYou, ...menu.eatWithCaution, ...menu.tryToAvoid];
  return {
    menuItems: items.map((item) => ({
      source_item_id: item.sourceItemId,
      tier: item.tier,
      tier_rank: item.tierRank,
      display_order: item.displayOrder,
      name: item.name,
      description: item.description ?? null,
      section: item.section ?? null,
      price: item.price ?? null,
      risk_score: item.riskScore,
      risk_level: item.riskLevel,
      confidence: item.confidence,
      scoring_confidence: item.scoringConfidence,
      base_food_category: item.baseFoodCategory ?? null,
      risk_modifiers: item.riskModifiers ?? [],
      score_contributors: item.scoreContributors,
      why_this_score: item.whyThisScore,
      gut_recommendation: item.gutRecommendation ?? null,
    })),
    ingredientRisks: items.flatMap((item) =>
      item.ingredientRisks.map((ingredient) => ({
        menu_item_source_id: item.sourceItemId,
        raw_name: ingredient.rawName,
        canonical_name: ingredient.canonicalName,
        risk_score: ingredient.riskScore,
        risk_level: ingredient.riskLevel,
        evidence: ingredient.evidence,
        confidence: ingredient.confidence,
        component_name: ingredient.componentName ?? item.name,
        reason: ingredient.reason,
        display_order: ingredient.displayOrder,
      })),
    ),
  };
}

function analysisMetadata(result: ReturnType<typeof computeScanResultFromStructured> | ReturnType<typeof computeMenuScanResultFromExtraction>) {
  return {
    extractionModel: result.structuredAnalysis.model,
    extractionPromptVersion: result.structuredAnalysis.promptVersion,
    extractionClarity: result.structuredAnalysis.clarity,
    extractionUnclearReason: result.structuredAnalysis.unclearReason ?? null,
    dishConfidence: result.structuredAnalysis.dishConfidence,
    imageDetail: result.structuredAnalysis.imageDetail,
    inputPageCount: result.structuredAnalysis.menuAnalysis?.inputPageCount ?? 1,
    prepStyle: result.structuredAnalysis.prepStyle,
    rubricVersion: result.rubricVersion ?? result.structuredAnalysis.rubricVersion ?? null,
  };
}

function errorAuditLog(error: unknown) {
  if (error && typeof error === 'object' && 'audit' in error) {
    return (error as { audit?: unknown }).audit;
  }

  return null;
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
    getScanById(admin, params.scanId, params.userId),
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
  const imagePaths = options.kind === 'image' ? normalizeImagePaths(options) : [];
  const imageDataUrls = options.kind === 'image' ? normalizeImageDataUrls(options) : [];
  const inputRefs = buildInputRefs({ kind: options.kind, scanCategory, inputText, imagePaths, imageDataUrls });
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
      imageStoragePath: options.kind === 'image' ? imagePaths[0] ?? null : null,
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
    const context = {
      knownConditions: profile?.knownConditions ?? [],
      knownIngredients: profile?.knownIngredientSensitivities ?? [],
    };

    if (scanCategory === 'menu') {
      if (options.kind !== 'image') {
        throw new ApiError('Please upload a photo or screenshot of a menu.', 422, 'menu_image_required');
      }

      const signedImageUrls = imageDataUrls.length
        ? []
        : await Promise.all(imagePaths.map((path) => createRequiredSignedImageUrl(admin, path, 'menu')));
      const menuImageUrls = imageDataUrls.length ? imageDataUrls : signedImageUrls;
      const menuExtractionStartedAt = Date.now();
      await recordSystemEvent(admin, {
        eventType: 'menu_extraction_started',
        userId: user.id,
        operation: 'scan_analysis',
        entityType: 'scan',
        entityId: reservation.scanId,
        requestId,
        metadata: {
          scanCategory,
          sourceType,
          pageCount: menuImageUrls.length,
          imagePathCount: imagePaths.length,
          imageDataUrlCount: imageDataUrls.length,
          imageDataUrlBytes: imageDataUrls.map(inlineImageDataUrlByteLength),
          inputMode: imageDataUrls.length ? 'inline_data_url' : 'signed_storage_url',
        },
      });
      const menuExtractionResult = await extractMenuFromImagesWithAudit(menuImageUrls, context);
      const menuExtraction = menuExtractionResult.result;
      await recordScanAiAuditLogs(admin, {
        userId: user.id,
        scanId: reservation.scanId,
        requestId,
        logs: menuExtractionResult.audits,
      });
      await recordSystemEvent(admin, {
        eventType: 'menu_extraction_completed',
        userId: user.id,
        operation: 'scan_analysis',
        entityType: 'scan',
        entityId: reservation.scanId,
        requestId,
        metadata: {
          scanCategory,
          sourceType,
          elapsedMs: Date.now() - menuExtractionStartedAt,
          menuItemCount: menuExtraction.items.length,
          menuPageCount: menuImageUrls.length,
          ingredientCount: menuExtraction.items.reduce(
            (total, item) => total + item.extractedIngredients.length + item.inferredIngredients.length,
            0,
          ),
        },
      });
      if (!menuExtraction.items.length) {
        throw new ApiError('Please upload a photo or screenshot of a menu.', 422, 'not_a_menu');
      }

      const result = computeMenuScanResultFromExtraction(
        menuExtraction,
        profile,
        insights,
        await createSignedStorageUrl(admin, imagePaths[0]) ?? undefined,
      );
      const menuPayload = menuResultPayload(result);
      const finalized = await completeReservedScanAnalysis(admin, {
        userId: user.id,
        scanId: reservation.scanId,
        title: result.dishName,
        overallRiskScore: result.overallRiskScore,
        overallRiskLevel: result.overallRiskLevel,
        pipTake: result.pipTake ?? result.interpretation,
        summary: result.summary ?? result.interpretation,
        baseFoodCategory: result.baseFoodCategory as unknown as Record<string, unknown> | null | undefined,
        riskModifiers: (result.riskModifiers ?? []) as unknown as Array<Record<string, unknown>>,
        scoreContributors: (result.scoreContributors ?? []) as unknown as Array<Record<string, unknown>>,
        scoringConfidence: result.scoringConfidence ?? null,
        gutRecommendation: result.gutRecommendation ?? null,
        rubricVersion: result.rubricVersion ?? null,
        conditionRisks: [],
        ingredientRisks: menuPayload.ingredientRisks,
        menuItems: menuPayload.menuItems,
        inputRefs,
        analysisMetadata: analysisMetadata(result),
        gutScoreImpact: result.gutScoreImpact as Record<string, unknown> | null | undefined,
      });
      scanCompleted = true;

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
          learningSyncStatus: 'not_applicable',
          menuItemCount: menuExtraction.items.length,
          menuPageCount: menuImageUrls.length,
          usedInlineImages: imageDataUrls.length > 0,
        },
      });

      return buildCompletedResponse(admin, {
        userId: user.id,
        scanId: finalized.scanId,
        requestId,
        deduped: false,
        learningSyncStatus: 'not_applicable',
      });
    }

    const extractionResult =
      options.kind === 'image'
        ? await extractMealFromImageWithAudit(
            imageDataUrls[0] ?? await createRequiredSignedImageUrl(admin, imagePaths[0], 'meal'),
            context,
          )
        : await extractMealFromTextWithAudit(inputText!, context);
    const extraction = extractionResult.result;
    await recordScanAiAuditLogs(admin, {
      userId: user.id,
      scanId: reservation.scanId,
      requestId,
      logs: extractionResult.audits,
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
      title: result.dishName,
      overallRiskScore: result.overallRiskScore,
      overallRiskLevel: result.overallRiskLevel,
      pipTake: result.pipTake ?? result.interpretation,
      summary: result.summary ?? result.interpretation,
      baseFoodCategory: result.baseFoodCategory as unknown as Record<string, unknown> | null | undefined,
      riskModifiers: (result.riskModifiers ?? []) as unknown as Array<Record<string, unknown>>,
      scoreContributors: (result.scoreContributors ?? []) as unknown as Array<Record<string, unknown>>,
      scoringConfidence: result.scoringConfidence ?? null,
      gutRecommendation: result.gutRecommendation ?? null,
      rubricVersion: result.rubricVersion ?? null,
      conditionRisks: conditionRiskPayload(result),
      ingredientRisks: ingredientRiskPayload(result),
      inputRefs,
      analysisMetadata: analysisMetadata(result),
      gutScoreImpact: result.gutScoreImpact as Record<string, unknown> | null | undefined,
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
    const failedAudit = errorAuditLog(error);
    if (failedAudit && reservation?.scanId) {
      try {
        await recordScanAiAuditLogs(admin, {
          userId: user.id,
          scanId: reservation.scanId,
          requestId,
          logs: [failedAudit as never],
        });
      } catch (auditError) {
        await recordSystemEvent(admin, {
          eventType: 'scan_ai_audit_log_failed',
          severity: 'error',
          userId: user.id,
          operation: 'scan_analysis',
          entityType: 'scan',
          entityId: reservation.scanId,
          requestId,
          metadata: errorMetadata(auditError),
        });
      }
    }

    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            scanCategory === 'menu' ? 'The menu could not be analyzed.' : 'The meal could not be analyzed.',
            500,
            'analysis_failed',
            errorMetadata(error),
          );

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

async function createRequiredSignedImageUrl(
  admin: SupabaseClient,
  imagePath: string | undefined,
  kind: 'meal' | 'menu',
) {
  if (!imagePath) {
    throw new ApiError(
      kind === 'menu' ? 'At least one menu image is required.' : 'A meal image is required.',
      400,
      'missing_image',
    );
  }

  const signedUrl = await createSignedStorageUrl(admin, imagePath);
  if (!signedUrl) {
    throw new ApiError(
      kind === 'menu' ? 'The menu image could not be loaded.' : 'The meal image could not be loaded.',
      500,
      'image_unavailable',
    );
  }

  return signedUrl;
}

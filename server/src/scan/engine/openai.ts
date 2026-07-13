// Public entry points for the OpenAI-backed scan engine: food extraction
// (text / image / multi-image), scan-category classification, menu extraction,
// and risk adjudication. The supporting pieces live in sibling modules:
// openaiConfig (env/models), openaiTypes (audit/context types),
// openaiSchemas (Zod-backed structured output), openaiClient (transport +
// retry), openaiCoercion (raw payload -> domain), openaiPrompts (prompt
// builders), and openaiMenuMerge (multi-page menu combination).

import { ExtractionResult, IngredientConfidence, MenuScanAnalysis } from './domain';
import {
  fallbackRiskAdjudicationPayload,
  RISK_ADJUDICATION_PROMPT_VERSION,
  type RiskAdjudicationPayload,
  type RiskAdjudicationRequest,
} from './riskAdjudication';
import { fallbackExtractionFromImage, fallbackExtractionFromText } from './scoring';
import {
  CLASSIFICATION_MODEL,
  DEMO_MODE,
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA_VERSION,
  extractionSamplingFields,
  FOOD_LLM_BANDS,
  IMAGE_DETAIL,
  IMAGE_EXTRACTION_MODEL,
  MENU_EXTRACTION_MODEL,
  MENU_EXTRACTION_SCHEMA_VERSION,
  MENU_IMAGE_DETAIL,
  OPENAI_API_KEY,
  OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS,
  OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
  OPENAI_MENU_MAX_OUTPUT_TOKENS,
  OPENAI_MENU_TIMEOUT_MS,
  OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS,
  OPENAI_RISK_ADJUDICATION_TIMEOUT_MS,
  OPENAI_TEXT_MAX_OUTPUT_TOKENS,
  reasoningFields,
  RISK_ADJUDICATION_MODEL,
  verbosityField,
} from './openaiConfig';
import type { ExtractionContext, ExtractionWithAudit } from './openaiTypes';
import {
  foodImageStructuredOutput,
  foodMultiImageStructuredOutput,
  foodTextStructuredOutput,
  MENU_ITEM_LIMIT,
  menuStructuredOutput,
  requestedRiskAdjudicationConditions,
  riskAdjudicationStructuredOutputForConditions,
  scanCategoryStructuredOutput,
} from './openaiSchemas';
import { imageRefKind, runResponsesRequestWithAuditRetry } from './openaiClient';
import {
  coerceExtraction,
  coerceMenuExtraction,
  coerceScanCategoryClassification,
} from './openaiCoercion';
import {
  buildImageSystemPrompt,
  buildImageUserPrompt,
  buildMenuSystemPrompt,
  buildMenuUserPrompt,
  buildMultiImageUserPrompt,
  buildRiskAdjudicationSystemPrompt,
  buildRiskAdjudicationUserPrompt,
  buildScanClassificationSystemPrompt,
  buildScanClassificationUserPrompt,
  buildTextSystemPrompt,
  buildTextUserPrompt,
} from './openaiPrompts';
import { combinedMenuAudit, combineMenuPageExtractions } from './openaiMenuMerge';

export {
  CLASSIFICATION_MODEL,
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA_VERSION,
  IMAGE_EXTRACTION_MODEL,
  MENU_EXTRACTION_MODEL,
  MENU_EXTRACTION_SCHEMA_VERSION,
  PROMPT_VERSION,
  RISK_ADJUDICATION_MODEL,
} from './openaiConfig';
export type { ExtractionContext, ExtractionWithAudit, OpenAiAuditLog } from './openaiTypes';
export { isTransientOpenAiError } from './openaiClient';
export { coerceConditionSeverities } from './openaiCoercion';

function shouldRequestFoodBands(context: ExtractionContext) {
  return FOOD_LLM_BANDS && (context.requestConditionBands ?? true);
}

export async function adjudicateScanRiskWithAudit(
  input: RiskAdjudicationRequest,
): Promise<ExtractionWithAudit<RiskAdjudicationPayload>> {
  const knownConditions = requestedRiskAdjudicationConditions(input.knownConditions);
  const adjudicationInput = { ...input, knownConditions };
  if (!OPENAI_API_KEY) {
    return { result: fallbackRiskAdjudicationPayload(adjudicationInput), audits: [] };
  }

  const systemPrompt = buildRiskAdjudicationSystemPrompt();
  const userPrompt = buildRiskAdjudicationUserPrompt(adjudicationInput);
  const structuredOutput = riskAdjudicationStructuredOutputForConditions(knownConditions);
  const request = {
    model: RISK_ADJUDICATION_MODEL,
    max_output_tokens: OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    text: {
      ...verbosityField(RISK_ADJUDICATION_MODEL),
      format: structuredOutput.format,
    },
    ...reasoningFields(RISK_ADJUDICATION_MODEL, 'low'),
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    structuredOutput,
    {
      stage: 'risk_adjudication',
      model: RISK_ADJUDICATION_MODEL,
      promptVersion: RISK_ADJUDICATION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: structuredOutput.jsonSchema,
      schemaVersion: 'risk_adjudication_v1',
      requestMetadata: {
        conditionCount: knownConditions.length,
        ragChunkCount: input.ragEvidence.length,
        personalEvidenceCount: input.personalEvidence.length,
      },
      inputRefs: input.ragEvidence.map((chunk, index) => ({
        inputKind: 'rag_chunk',
        index,
        chunkId: chunk.chunkId,
        source: chunk.source,
      })),
    },
    { timeoutMs: OPENAI_RISK_ADJUDICATION_TIMEOUT_MS },
  );

  return {
    result: parsed,
    audits: [
      {
        ...audit,
        normalizedResponseJson: parsed,
      },
    ],
  };
}

// No OPENAI_API_KEY is only survivable in explicit demo mode; anywhere else it
// must fail loudly rather than fabricate a meal (startup validation should have
// crashed the server long before this point).
function assertDemoFallbackAllowed(stage: string) {
  if (!DEMO_MODE) {
    throw new Error(`openai_api_key_missing:${stage}`);
  }
}

export async function extractMealFromTextWithAudit(
  text: string,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!OPENAI_API_KEY) {
    assertDemoFallbackAllowed('food_text_extraction');
    return { result: fallbackExtractionFromText(text), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildTextSystemPrompt(includeBands);
  const userPrompt = buildTextUserPrompt(text, context, includeBands);
  const request = {
    model: EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    max_output_tokens: OPENAI_TEXT_MAX_OUTPUT_TOKENS,
    text: {
      ...verbosityField(EXTRACTION_MODEL),
      format: foodTextStructuredOutput.format,
    },
    ...reasoningFields(EXTRACTION_MODEL, 'low'),
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    foodTextStructuredOutput,
    {
      stage: 'food_text_extraction',
      model: EXTRACTION_MODEL,
      systemPrompt,
      userPrompt,
      jsonSchema: foodTextStructuredOutput.jsonSchema,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      requestMetadata: { source: 'text', includeConditionBands: includeBands },
      inputRefs: [{ inputKind: 'text' }],
    },
  );
  const result = coerceExtraction(parsed, {
    model: EXTRACTION_MODEL,
    imageDetail: 'not_applicable',
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
  };
}

export async function classifyScanImagesWithAudit(
  imageUrls: string[],
): Promise<ExtractionWithAudit<{ category: 'food' | 'menu'; confidence: IngredientConfidence; reason: string }>> {
  if (!imageUrls.length || !OPENAI_API_KEY) {
    const fallbackCategory = imageUrls.length > 1 ? 'menu' : 'food';
    return {
      result: {
        category: fallbackCategory,
        confidence: 'low',
        reason: imageUrls.length > 1 ? 'Multiple images usually indicate a menu scan.' : 'Default single-image scan route.',
      },
      audits: [],
    };
  }

  const systemPrompt = buildScanClassificationSystemPrompt();
  const userPrompt = buildScanClassificationUserPrompt(imageUrls.length);
  const request = {
    model: CLASSIFICATION_MODEL,
    max_output_tokens: OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            // Routing needs the gist, not the detail; low keeps the router cheap.
            detail: 'low',
          })),
        ],
      },
    ],
    text: {
      ...verbosityField(CLASSIFICATION_MODEL),
      format: scanCategoryStructuredOutput.format,
    },
    // Reasoning tokens count against max_output_tokens; minimal effort keeps
    // the small classification cap from being eaten before the JSON is emitted.
    ...reasoningFields(CLASSIFICATION_MODEL, 'minimal'),
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    pageIndex: index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    scanCategoryStructuredOutput,
    {
      stage: 'scan_category_classification',
      model: CLASSIFICATION_MODEL,
      systemPrompt,
      userPrompt,
      jsonSchema: scanCategoryStructuredOutput.jsonSchema,
      schemaVersion: 'scan_category_classification_v1',
      requestMetadata: { imageCount: imageUrls.length, imageDetail: 'low' },
      inputRefs,
    },
  );
  const result = coerceScanCategoryClassification(parsed);

  return {
    result,
    audits: [
      {
        ...audit,
        normalizedResponseJson: result,
      },
    ],
  };
}

export async function extractMealFromImageWithAudit(
  imageUrl: string | null,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!imageUrl || !OPENAI_API_KEY) {
    assertDemoFallbackAllowed('food_image_extraction');
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildImageSystemPrompt(includeBands);
  const userPrompt = buildImageUserPrompt(context, includeBands);
  const request = {
    model: IMAGE_EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    max_output_tokens: OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          {
            type: 'input_image',
            image_url: imageUrl,
            detail: IMAGE_DETAIL,
          },
        ],
      },
    ],
    text: {
      ...verbosityField(IMAGE_EXTRACTION_MODEL),
      format: foodImageStructuredOutput.format,
    },
    ...reasoningFields(IMAGE_EXTRACTION_MODEL, 'low'),
  };

  const inputRefs = [{ inputKind: 'image', imageRef: imageRefKind(imageUrl) }];
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    foodImageStructuredOutput,
    {
      stage: 'food_image_extraction',
      model: IMAGE_EXTRACTION_MODEL,
      systemPrompt,
      userPrompt,
      jsonSchema: foodImageStructuredOutput.jsonSchema,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      requestMetadata: { imageDetail: IMAGE_DETAIL, includeConditionBands: includeBands },
      inputRefs,
    },
  );
  const result = coerceExtraction(parsed, {
    model: IMAGE_EXTRACTION_MODEL,
    imageDetail: IMAGE_DETAIL,
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
  };
}

export async function extractMealFromImagesWithAudit(
  imageUrls: string[],
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (imageUrls.length <= 1) {
    return extractMealFromImageWithAudit(imageUrls[0] ?? null, context);
  }

  if (!OPENAI_API_KEY) {
    assertDemoFallbackAllowed('food_multi_image_extraction');
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildImageSystemPrompt(includeBands);
  const userPrompt = buildMultiImageUserPrompt({ ...context, imageCount: imageUrls.length }, includeBands);
  const request = {
    model: IMAGE_EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    max_output_tokens: OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            detail: IMAGE_DETAIL,
          })),
        ],
      },
    ],
    text: {
      ...verbosityField(IMAGE_EXTRACTION_MODEL),
      format: foodMultiImageStructuredOutput.format,
    },
    ...reasoningFields(IMAGE_EXTRACTION_MODEL, 'low'),
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'meal',
    pageIndex: index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    foodMultiImageStructuredOutput,
    {
      stage: 'food_multi_image_extraction',
      model: IMAGE_EXTRACTION_MODEL,
      systemPrompt,
      userPrompt,
      jsonSchema: foodMultiImageStructuredOutput.jsonSchema,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      requestMetadata: {
        imageDetail: IMAGE_DETAIL,
        imageCount: imageUrls.length,
        includeConditionBands: includeBands,
      },
      inputRefs,
    },
  );
  const result = coerceExtraction(parsed, {
    model: IMAGE_EXTRACTION_MODEL,
    imageDetail: IMAGE_DETAIL,
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
  };
}

async function requestMenuExtraction(
  imageUrls: string[],
  context: ExtractionContext,
  options: { stage: string; pageOffset: number; totalPageCount: number; splitByPage: boolean },
) {
  const systemPrompt = buildMenuSystemPrompt();
  const userPrompt = buildMenuUserPrompt({ ...context, pageCount: imageUrls.length });
  const request = {
    model: MENU_EXTRACTION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            detail: MENU_IMAGE_DETAIL,
          })),
        ],
      },
    ],
    text: {
      ...verbosityField(MENU_EXTRACTION_MODEL),
      format: menuStructuredOutput.format,
    },
    ...reasoningFields(MENU_EXTRACTION_MODEL, 'minimal'),
    max_output_tokens: OPENAI_MENU_MAX_OUTPUT_TOKENS,
  };
  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'menu_page',
    pageIndex: options.pageOffset + index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    menuStructuredOutput,
    {
      stage: options.stage,
      model: MENU_EXTRACTION_MODEL,
      systemPrompt,
      userPrompt,
      jsonSchema: menuStructuredOutput.jsonSchema,
      schemaVersion: MENU_EXTRACTION_SCHEMA_VERSION,
      requestMetadata: {
        imageDetail: MENU_IMAGE_DETAIL,
        pageCount: imageUrls.length,
        totalPageCount: options.totalPageCount,
        pageOffset: options.pageOffset,
        itemLimit: MENU_ITEM_LIMIT,
        splitByPage: options.splitByPage,
      },
      inputRefs,
    },
    { timeoutMs: OPENAI_MENU_TIMEOUT_MS },
  );

  const result = coerceMenuExtraction(parsed, imageUrls.length, context.knownIngredients);
  return {
    parsed,
    result,
    audit: { ...audit, normalizedResponseJson: result },
  };
}

export async function extractMenuFromImagesWithAudit(
  imageUrls: string[],
  context: ExtractionContext,
): Promise<ExtractionWithAudit<MenuScanAnalysis>> {
  if (!imageUrls.length) {
    return {
      result: coerceMenuExtraction(
      {
        isMenu: false,
        notMenuReason: 'No menu images were provided.',
        menuTitle: 'Menu scan',
        menuConfidence: 'low',
        items: [],
      },
      0,
      context.knownIngredients,
      ),
      audits: [],
    };
  }

  if (!OPENAI_API_KEY) {
    assertDemoFallbackAllowed('menu_image_extraction');
    return {
      result: coerceMenuExtraction(
      {
        isMenu: true,
        notMenuReason: null,
        menuTitle: 'Demo menu',
        menuConfidence: 'medium',
        items: [
          {
            id: 'item-1',
            name: 'Grilled salmon bowl',
            description: 'Salmon with rice, cucumber, greens, and lemon.',
            section: 'Entrees',
            price: '$18',
            baseFoodCategory: {
              key: 'mixed_dish_or_entree',
              confidence: 'medium',
              evidence: 'common_dish_knowledge',
              source: 'salmon bowl',
            },
            riskModifiers: [],
            conditionSeverities: [],
            dietFitHypotheses: [],
            ingredientCallouts: ['salmon', 'rice', 'cucumber'],
            prepStyle: ['grilled'],
            confidence: 'medium',
          },
          {
            id: 'item-2',
            name: 'Creamy tomato pasta',
            description: 'Pasta with tomato cream sauce, garlic, and parmesan.',
            section: 'Pasta',
            price: '$16',
            baseFoodCategory: {
              key: 'wheat_grain_based',
              confidence: 'high',
              evidence: 'name',
              source: 'pasta',
            },
            riskModifiers: [],
            conditionSeverities: [],
            dietFitHypotheses: [],
            ingredientCallouts: ['tomato', 'cream', 'garlic'],
            prepStyle: ['creamy'],
            confidence: 'medium',
          },
        ],
      },
      imageUrls.length,
      context.knownIngredients,
      ),
      audits: [],
    };
  }

  if (imageUrls.length === 1) {
    const pageResult = await requestMenuExtraction(imageUrls, context, {
      stage: 'menu_image_extraction',
      pageOffset: 0,
      totalPageCount: 1,
      splitByPage: false,
    });
    return { result: pageResult.result, audits: [pageResult.audit] };
  }

  const pageResults = await Promise.all(
    imageUrls.map((imageUrl, pageIndex) =>
      requestMenuExtraction([imageUrl], context, {
        stage: 'menu_image_extraction_page',
        pageOffset: pageIndex,
        totalPageCount: imageUrls.length,
        splitByPage: true,
      }),
    ),
  );
  const result = combineMenuPageExtractions(pageResults, imageUrls.length);
  const combinedAudit = combinedMenuAudit(pageResults, result, context, imageUrls);
  return { result, audits: [combinedAudit, ...pageResults.map((entry) => entry.audit)] };
}

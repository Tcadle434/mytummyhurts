import { CONDITION_BAND_ORDER } from '@mth/shared-domain';
import { z } from 'zod';

import { defineStructuredOutput } from '../../llm/structured-output';
import {
  CONDITION_DRIVERS_REQUIRED_MESSAGE,
  REQUESTED_CONDITION_REQUIRED_MESSAGE,
  REQUESTED_CONDITION_SET_REQUIRED_MESSAGE,
} from '../../llm/structured-output-messages';
import { dietFitStatusValues, dietPreferenceKeys } from './dietRubric';
import {
  menuBaseFoodCategoryKeys,
  menuRiskModifierKeys,
  menuRubricEvidenceValues,
} from './menuRubric';
import type { ConditionSeverityBand } from './domain';

export const MENU_ITEM_LIMIT = 100;

const confidenceSchema = z.enum(['low', 'medium', 'high']);
const severityBandValues = [...CONDITION_BAND_ORDER] as [
  ConditionSeverityBand,
  ...ConditionSeverityBand[],
];
const severityBandSchema = z.enum(severityBandValues);
const nonblankString = z.string().trim().min(1);

const ROLE_FIELD_DESCRIPTION =
  'Culinary role in this meal: main = a central protein or star item, side = an accompanying item, condiment = sauce/spread/dressing, garnish = a small finishing touch, base = the starch or foundation. A splash of vinegar, sauce, or pickled garnish is a condiment or garnish, not a main.';
const PROMINENCE_FIELD_DESCRIPTION =
  'Visual salience: primary = a defining, immediately obvious element; secondary = clearly present but not defining; trace = barely visible. Prominence is about how noticeable the ingredient is; amountEstimate is about how much of it there is.';
const AMOUNT_ESTIMATE_FIELD_DESCRIPTION =
  'How much of the meal the ingredient occupies: trace = barely present or seasoning-level, small = visible but minor, standard = a normal component, large = an unusually large share, dominant = the main base or defining ingredient.';
const AMOUNT_BASIS_FIELD_DESCRIPTION =
  'Short phrase citing the evidence for amountEstimate, such as "thin drizzle across the bowl" or "covers most of the plate".';
const CANONICAL_NAME_FIELD_DESCRIPTION =
  'Canonical food name, singular lowercase. Must be an actual food or ingredient name, never a rubric category key such as spicy_heat or dairy_based.';
const menuBaseFoodCategorySchema = z.object({
  key: z.enum(menuBaseFoodCategoryKeys),
  confidence: confidenceSchema,
  evidence: z.enum(menuRubricEvidenceValues),
  source: z.string(),
}).strict();

const menuRiskModifierSchema = z.object({
  key: z.enum(menuRiskModifierKeys),
  confidence: confidenceSchema,
  evidence: z.enum(menuRubricEvidenceValues),
  source: z.string(),
}).strict();

export const dietFitHypothesisSchema = z.object({
  dietKey: z.enum(dietPreferenceKeys),
  status: z.enum(dietFitStatusValues),
  confidence: confidenceSchema,
  evidence: z.array(z.string()).max(4),
  conflicts: z.array(z.string()).max(4),
  missingInfo: z.array(z.string()).max(4),
  reason: z.string(),
}).strict();

export const ingredientPayloadSchema = z.object({
  rawName: nonblankString,
  canonicalName: z.string().describe(CANONICAL_NAME_FIELD_DESCRIPTION),
  confidence: confidenceSchema,
  component: z.string().nullable(),
  evidence: z.enum(['visible', 'inferred']),
  role: z.enum(['main', 'side', 'condiment', 'garnish', 'base']).nullable().describe(ROLE_FIELD_DESCRIPTION),
  prominence: z.enum(['primary', 'secondary', 'trace']).nullable().describe(PROMINENCE_FIELD_DESCRIPTION),
  amountEstimate: z.enum(['trace', 'small', 'standard', 'large', 'dominant']).nullable().describe(AMOUNT_ESTIMATE_FIELD_DESCRIPTION),
  amountBasis: z.string().nullable().describe(AMOUNT_BASIS_FIELD_DESCRIPTION),
}).strict();

const visibleIngredientSchema = ingredientPayloadSchema.extend({ evidence: z.literal('visible') }).strict();
const inferredIngredientSchema = ingredientPayloadSchema.extend({ evidence: z.literal('inferred') }).strict();

function conditionSeveritySchema(includeRationale: boolean) {
  const shape = {
    condition: nonblankString,
    band: severityBandSchema,
    drivers: z.array(nonblankString).max(6),
    ...(includeRationale ? { rationale: z.string() } : {}),
  };
  return z.object(shape).strict().superRefine((value, context) => {
    if (
      (value.band === 'moderate' || value.band === 'high' || value.band === 'severe') &&
      value.drivers.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['drivers'],
        message: CONDITION_DRIVERS_REQUIRED_MESSAGE,
      });
    }
  });
}

export const foodConditionSeveritySchema = conditionSeveritySchema(true);
export const menuConditionSeveritySchema = conditionSeveritySchema(false);

export const mealExtractionSchema = z.object({
  dishName: z.string(),
  dishConfidence: confidenceSchema,
  clarity: z.enum(['clear', 'unclear']),
  unclearReason: z.string().nullable(),
  components: z.array(z.object({
    name: z.string(),
    confidence: confidenceSchema,
    prepStyle: z.array(z.string()).max(12),
  }).strict()).max(20),
  visibleIngredients: z.array(visibleIngredientSchema).max(50),
  inferredIngredients: z.array(inferredIngredientSchema).max(50),
  prepStyle: z.array(z.string()).max(12),
  notes: z.array(z.string()).max(12),
  baseFoodCategory: menuBaseFoodCategorySchema,
  riskModifiers: z.array(menuRiskModifierSchema).max(10),
  conditionSeverities: z.array(foodConditionSeveritySchema).max(8),
  dietFitHypotheses: z.array(dietFitHypothesisSchema).max(10),
}).strict();

export const scanCategoryClassificationSchema = z.object({
  category: z.enum(['food', 'menu']),
  confidence: confidenceSchema,
  reason: z.string(),
}).strict();

export const riskAdjudicationConditionSchema = z.object({
  condition: nonblankString,
  genericBand: severityBandSchema,
  personalizedBand: severityBandSchema,
  finalBand: severityBandSchema,
  drivers: z.array(nonblankString).max(6),
  protectiveEvidence: z.array(z.string()).max(6),
  citationChunkIds: z.array(z.string()).max(8),
  personalEvidenceUsed: z.array(z.string()).max(6),
  confidence: confidenceSchema,
  rationale: z.string(),
}).strict().superRefine((value, context) => {
  const requiresDrivers = [value.genericBand, value.personalizedBand, value.finalBand]
    .some((band) => band === 'moderate' || band === 'high' || band === 'severe');
  if (requiresDrivers && value.drivers.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['drivers'],
      message: CONDITION_DRIVERS_REQUIRED_MESSAGE,
    });
  }
});

function riskAdjudicationPayloadSchema(conditionCount?: number) {
  const conditionSeverities = z.array(riskAdjudicationConditionSchema);
  return z.object({
    conditionSeverities: conditionCount === undefined
      ? conditionSeverities
      : conditionSeverities.length(conditionCount),
  }).strict();
}

export const riskAdjudicationSchema = riskAdjudicationPayloadSchema();

export const menuItemPayloadSchema = z.object({
  id: nonblankString,
  name: nonblankString,
  description: z.string().nullable(),
  section: z.string().nullable(),
  price: z.string().nullable(),
  baseFoodCategory: menuBaseFoodCategorySchema,
  riskModifiers: z.array(menuRiskModifierSchema).max(5),
  conditionSeverities: z.array(menuConditionSeveritySchema).max(8),
  dietFitHypotheses: z.array(dietFitHypothesisSchema).max(10),
  ingredientCallouts: z.array(z.string()).max(3),
  prepStyle: z.array(z.string()).max(4),
  confidence: confidenceSchema,
}).strict();

export const menuExtractionSchema = z.object({
  isMenu: z.boolean(),
  notMenuReason: z.string().nullable(),
  menuTitle: z.string(),
  menuConfidence: confidenceSchema,
  items: z.array(menuItemPayloadSchema).max(MENU_ITEM_LIMIT),
}).strict();

export type IngredientPayload = z.infer<typeof ingredientPayloadSchema>;
export type MealComponentPayload = z.infer<typeof mealExtractionSchema>['components'][number];
export type MealExtractionPayload = z.infer<typeof mealExtractionSchema>;
export type ScanCategoryClassificationPayload = z.infer<typeof scanCategoryClassificationSchema>;
export type MenuItemPayload = z.infer<typeof menuItemPayloadSchema>;
export type MenuBaseFoodCategoryPayload = z.infer<typeof menuBaseFoodCategorySchema>;
export type MenuRiskModifierPayload = z.infer<typeof menuRiskModifierSchema>;
export type DietFitHypothesisPayload = z.infer<typeof dietFitHypothesisSchema>;
export type MenuExtractionPayload = z.infer<typeof menuExtractionSchema>;
export type RiskAdjudicationConditionPayload = z.infer<typeof riskAdjudicationConditionSchema>;
export type RiskAdjudicationPayload = z.infer<typeof riskAdjudicationSchema>;

export const foodTextStructuredOutput = defineStructuredOutput('meal_extraction_text', mealExtractionSchema);
export const foodImageStructuredOutput = defineStructuredOutput('meal_extraction_image', mealExtractionSchema);
export const foodMultiImageStructuredOutput = defineStructuredOutput('meal_extraction_images', mealExtractionSchema);
export const scanCategoryStructuredOutput = defineStructuredOutput(
  'scan_category_classification',
  scanCategoryClassificationSchema,
);
export const menuStructuredOutput = defineStructuredOutput('menu_extraction_image', menuExtractionSchema);
export const riskAdjudicationStructuredOutput = defineStructuredOutput('risk_adjudication', riskAdjudicationSchema);

export function riskAdjudicationConditionKey(condition: string) {
  const normalized = condition.trim().normalize('NFKC').toLowerCase();
  const key = normalized
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim() || normalized;
  if (key === 'gerd' || key.includes('acid reflux') || key.includes('reflux')) return 'gerd acid reflux';
  if (key === 'ibs' || key.includes('irritable bowel')) return 'ibs';
  return key;
}

export function requestedRiskAdjudicationConditionKeys(conditions: string[]) {
  const nonblankConditions = conditions.filter((condition) => condition.trim());
  if (!nonblankConditions.length) return new Set(['general']);
  return new Set(nonblankConditions.map(riskAdjudicationConditionKey));
}

export function hasExactRiskAdjudicationConditions(
  rows: readonly unknown[],
  conditions: string[],
) {
  const expected = requestedRiskAdjudicationConditionKeys(conditions);
  const actual: string[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !('condition' in row) || typeof row.condition !== 'string') {
      return false;
    }
    actual.push(riskAdjudicationConditionKey(row.condition));
  }
  return actual.length === expected.size
    && new Set(actual).size === actual.length
    && actual.every((condition) => expected.has(condition));
}

export function riskAdjudicationStructuredOutputForConditions(conditions: string[]) {
  const allowedConditions = requestedRiskAdjudicationConditionKeys(conditions);
  const schema = riskAdjudicationPayloadSchema(allowedConditions.size).superRefine((payload, context) => {
    payload.conditionSeverities.forEach((severity, index) => {
      if (!allowedConditions.has(riskAdjudicationConditionKey(severity.condition))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conditionSeverities', index, 'condition'],
          message: REQUESTED_CONDITION_REQUIRED_MESSAGE,
        });
      }
    });
    if (!hasExactRiskAdjudicationConditions(payload.conditionSeverities, conditions)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conditionSeverities'],
        message: REQUESTED_CONDITION_SET_REQUIRED_MESSAGE,
      });
    }
  });
  return defineStructuredOutput('risk_adjudication', schema);
}

import { z } from 'zod';

import { defineStructuredOutput } from '../llm/structured-output';
import type { DigestivePatternKey, TrackedFoodFamilyKey } from '../scan/engine/domain';
import { DIGESTIVE_PATTERNS, TRACKED_FOOD_FAMILIES } from './taxonomy.constants';

const foodFamilyKeys = TRACKED_FOOD_FAMILIES.map((entry) => entry.key) as [
  TrackedFoodFamilyKey,
  ...TrackedFoodFamilyKey[],
];
const digestivePatternKeys = DIGESTIVE_PATTERNS.map((entry) => entry.key) as [
  DigestivePatternKey,
  ...DigestivePatternKey[],
];

export const taxonomyClassificationSchema = z.object({
  primaryFoodFamilyKey: z.enum(foodFamilyKeys),
  digestivePatternKeys: z.array(z.enum(digestivePatternKeys)).max(DIGESTIVE_PATTERNS.length),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
}).strict();

export type TaxonomyClassificationPayload = z.infer<typeof taxonomyClassificationSchema>;

export const taxonomyStructuredOutput = defineStructuredOutput(
  'ingredient_taxonomy_classification',
  taxonomyClassificationSchema,
);

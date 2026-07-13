import { z } from 'zod';

import { defineStructuredOutput } from '../llm/structured-output';

export const MAX_LAST_BAD_MEAL_SUSPECTS = 12;

export const LAST_BAD_MEAL_MECHANISM_KEYS = [
  'wheat_fructan_or_gluten',
  'creamy_or_lactose',
  'high_fat_or_rich',
  'processed_meat',
  'acidic_tomato_citrus_vinegar',
  'allium_garlic_onion',
  'legume_gos',
  'high_fiber_or_gassy',
  'spicy_heat',
  'unknown_sauce_or_marinade',
  'fried_or_crispy',
  'high_fructose',
  'sweet_polyol',
  'caffeine',
  'carbonation',
  'alcohol',
  'chocolate_or_mint',
  'fermented_or_histamine',
] as const;

export const lastBadMealSuspectSchema = z.object({
  canonicalName: z.string().trim().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  source: z.enum(['explicit_text', 'dish_name', 'standard_component']),
  mechanisms: z.array(z.enum(LAST_BAD_MEAL_MECHANISM_KEYS)).max(6),
}).strict();

export const lastBadMealSchema = z.object({
  dishNames: z.array(z.string()).max(5),
  suspectIngredients: z.array(lastBadMealSuspectSchema).max(MAX_LAST_BAD_MEAL_SUSPECTS),
  notes: z.array(z.string()).max(5),
}).strict();

export type LastBadMealPayload = z.infer<typeof lastBadMealSchema>;

export const lastBadMealStructuredOutput = defineStructuredOutput(
  'last_bad_meal_extraction',
  lastBadMealSchema,
);

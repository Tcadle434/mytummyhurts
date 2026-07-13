import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';

import type {
  DigestivePatternKey,
  IngredientInsight,
  IngredientTaxonomyClassification,
  IngredientTaxonomyConfidence,
  TrackedFoodFamilyKey,
} from '../scan/engine/domain';
import { requestStructuredOutput, StructuredOutputError } from '../llm/structured-output';
import {
  DIGESTIVE_PATTERNS,
  TAXONOMY_PROMPT_VERSION,
  TAXONOMY_VERSION,
  TRACKED_FOOD_FAMILIES,
  makeTaxonomyClassification,
  normalizeIngredientName,
} from './taxonomy.constants';
import {
  taxonomyClassificationSchema,
  taxonomyStructuredOutput,
  type TaxonomyClassificationPayload,
} from './taxonomy-output.schema';

type Rule = {
  aliases: string[];
  family: TrackedFoodFamilyKey;
  patterns?: DigestivePatternKey[];
  confidence?: IngredientTaxonomyConfidence;
  reason: string;
};

const MAX_LLM_CLASSIFICATIONS_PER_PHASE = 25;
const DEFAULT_CLASSIFICATION_PHASE_BUDGET_MS = 30_000;

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const RULES: Rule[] = [
  { aliases: ['gochujang'], family: 'sauces_condiments', patterns: ['spicy_heat', 'fermented_aged_histamine'], confidence: 'high', reason: 'Gochujang is a spicy fermented chili condiment.' },
  { aliases: ['rice vinegar', 'vinegar'], family: 'sauces_condiments', patterns: ['acidic_pickled'], confidence: 'high', reason: 'Vinegar-based ingredients are acidic condiment exposures.' },
  { aliases: ['pickled ginger', 'takuan', 'pickle', 'pickles', 'pickled onion'], family: 'pickled_fermented', patterns: ['acidic_pickled'], confidence: 'high', reason: 'Pickled foods are acidic/pickled exposures.' },
  { aliases: ['kimchi', 'sauerkraut'], family: 'pickled_fermented', patterns: ['fermented_aged_histamine', 'acidic_pickled'], confidence: 'high', reason: 'Fermented pickled foods fit fermented and acidic patterns.' },
  { aliases: ['miso', 'soy sauce', 'tamari', 'kombucha'], family: 'sauces_condiments', patterns: ['fermented_aged_histamine'], confidence: 'high', reason: 'Fermented condiments and drinks fit the fermented/aged pattern.' },
  { aliases: ['milk', 'cheese', 'yogurt', 'yoghurt', 'cream', 'ice cream', 'gelato', 'whey', 'casein', 'butter'], family: 'dairy_foods', patterns: ['lactose_dairy'], confidence: 'high', reason: 'Dairy foods can contribute lactose/dairy load.' },
  { aliases: ['garlic', 'onion', 'shallot', 'leek', 'scallion', 'green onion', 'chive'], family: 'allium_vegetables', patterns: ['allium_fructans'], confidence: 'high', reason: 'Alliums map to fructan/allium digestive patterns.' },
  { aliases: ['bread', 'pasta', 'flour', 'bun', 'ramen', 'rye', 'bagel', 'croissant', 'tortilla', 'breadcrumbs', 'cracker', 'noodle'], family: 'wheat_grains', patterns: ['wheat_fructan_gluten'], confidence: 'high', reason: 'Wheat-based grains map to wheat fructan/gluten exposure.' },
  { aliases: ['beans', 'bean', 'lentil', 'lentils', 'chickpea', 'chickpeas', 'edamame', 'hummus', 'falafel', 'tofu', 'soybean', 'soy bean'], family: 'legumes_soy_pulses', patterns: ['legume_gos'], confidence: 'high', reason: 'Legumes and soy pulses map to GOS/legume fermentation.' },
  { aliases: ['apple', 'pear', 'mango', 'honey', 'agave', 'fruit juice'], family: 'other_fruits', patterns: ['excess_fructose'], confidence: 'high', reason: 'These foods are common excess-fructose exposures.' },
  { aliases: ['sorbitol', 'mannitol', 'xylitol', 'maltitol', 'erythritol', 'sugar free', 'sugar-free', 'diet soda'], family: 'sugar_free_diet', patterns: ['polyol_sweeteners'], confidence: 'high', reason: 'Sugar-free/diet sweeteners often indicate polyol exposure.' },
  { aliases: ['broccoli', 'cabbage', 'cauliflower', 'brussels sprout', 'mushroom', 'mushrooms', 'bran'], family: 'gassy_vegetables', patterns: ['gassy_high_fiber_plants'], confidence: 'high', reason: 'These vegetables commonly create fiber/fermentation load.' },
  { aliases: ['fries', 'fried', 'tempura', 'battered', 'breaded', 'crispy', 'deep fried', 'deep-fried'], family: 'mixed_dishes', patterns: ['fried_crispy', 'high_fat_rich'], confidence: 'medium', reason: 'Fried or crispy prep is a fried/high-fat exposure.' },
  { aliases: ['mayo', 'mayonnaise', 'aioli', 'avocado', 'olive oil', 'pesto', 'loaded toppings'], family: 'plant_fats_spreads', patterns: ['high_fat_rich'], confidence: 'high', reason: 'Rich spreads and plant fats contribute high-fat load.' },
  { aliases: ['tomato', 'marinara', 'salsa', 'ketchup', 'mustard', 'lemon', 'lime', 'orange', 'grapefruit', 'citrus'], family: 'tomato_citrus_fruit', patterns: ['acidic_pickled'], confidence: 'high', reason: 'Tomato, citrus, and acidic condiments map to acid exposure.' },
  { aliases: ['chili', 'chilli', 'hot sauce', 'jalapeno', 'sriracha', 'cayenne', 'habanero', 'pepper flakes', 'buffalo sauce'], family: 'sauces_condiments', patterns: ['spicy_heat'], confidence: 'high', reason: 'Chili pepper heat maps to capsaicin/spicy exposure.' },
  { aliases: ['coffee', 'espresso', 'latte', 'matcha', 'energy drink', 'black tea', 'green tea'], family: 'non_alcoholic_drinks', patterns: ['caffeine_stimulants'], confidence: 'high', reason: 'Coffee, tea, matcha, and energy drinks are caffeine exposures.' },
  { aliases: ['soda', 'sparkling water', 'seltzer', 'tonic', 'cola', 'fizzy'], family: 'non_alcoholic_drinks', patterns: ['carbonation'], confidence: 'high', reason: 'Carbonated beverages map to carbonation/gas exposure.' },
  { aliases: ['beer', 'wine', 'cocktail', 'liquor', 'vodka', 'whiskey', 'tequila', 'rum', 'sake'], family: 'alcoholic_drinks', patterns: ['alcohol'], confidence: 'high', reason: 'Alcoholic drinks map to alcohol exposure.' },
  { aliases: ['chocolate', 'cocoa', 'mocha', 'brownie', 'fudge'], family: 'desserts_sweets', patterns: ['chocolate_cocoa'], confidence: 'high', reason: 'Chocolate/cocoa maps to the chocolate reflux pattern.' },
  { aliases: ['mint', 'peppermint', 'spearmint', 'mint tea'], family: 'non_alcoholic_drinks', patterns: ['mint'], confidence: 'high', reason: 'Mint ingredients map to peppermint/spearmint exposure.' },
  { aliases: ['emulsifier', 'emulsifiers', 'gum', 'gums', 'preservative', 'preservatives'], family: 'unknown_unclassified', patterns: ['ultra_processed_additives'], confidence: 'medium', reason: 'Additives map to the processed/additive-heavy pattern.' },
  { aliases: ['turkey', 'chicken', 'lean beef'], family: 'lean_poultry_meat', confidence: 'high', reason: 'Lean poultry and lean meats are tracked as lean meat foods.' },
  { aliases: ['burger', 'ribs', 'pork belly', 'duck'], family: 'fatty_rich_meat', patterns: ['high_fat_rich'], confidence: 'high', reason: 'Fatty meats are tracked as rich meat foods and high-fat exposure.' },
  { aliases: ['bacon', 'sausage', 'salami', 'ham', 'pepperoni'], family: 'processed_cured_meat', patterns: ['high_fat_rich', 'ultra_processed_additives'], confidence: 'high', reason: 'Processed cured meats are rich and processed exposures.' },
  { aliases: ['cod', 'tuna', 'shrimp', 'crab'], family: 'lean_seafood', confidence: 'high', reason: 'Lean seafood is tracked as a seafood family.' },
  { aliases: ['salmon', 'mackerel', 'eel', 'sardine'], family: 'fatty_seafood', confidence: 'high', reason: 'Rich seafood is tracked separately from lean seafood.' },
  { aliases: ['egg', 'eggs', 'omelet', 'omelette', 'tamago', 'quiche'], family: 'eggs', confidence: 'high', reason: 'Egg-based foods are tracked as eggs.' },
  { aliases: ['rice', 'oats', 'oat', 'corn', 'quinoa'], family: 'non_wheat_grains', confidence: 'high', reason: 'Rice and non-wheat grains are tracked together.' },
  { aliases: ['potato', 'sweet potato', 'taro', 'cassava'], family: 'root_tuber_starches', confidence: 'high', reason: 'Root and tuber starches are tracked together.' },
  { aliases: ['lettuce', 'cucumber', 'carrot', 'nori', 'seaweed', 'spinach', 'zucchini'], family: 'gentle_vegetables_seaweed', confidence: 'high', reason: 'These vegetables and seaweed are tracked as gentler plants.' },
  { aliases: ['banana', 'berries', 'berry', 'strawberry', 'blueberry', 'grape'], family: 'other_fruits', confidence: 'high', reason: 'Fruits without a stronger pattern are tracked as fruits.' },
  { aliases: ['sesame', 'sesame seed', 'chia', 'almond', 'walnut', 'peanut'], family: 'nuts_seeds', confidence: 'high', reason: 'Nuts and seeds are tracked together.' },
  { aliases: ['dressing', 'sauce', 'condiment'], family: 'sauces_condiments', confidence: 'medium', reason: 'Generic sauces and condiments are tracked together.' },
  { aliases: ['cake', 'cookie', 'candy', 'syrup', 'dessert'], family: 'desserts_sweets', confidence: 'high', reason: 'Desserts and sweets are tracked together.' },
  { aliases: ['juice', 'smoothie'], family: 'non_alcoholic_drinks', confidence: 'medium', reason: 'Non-alcoholic beverages are tracked together.' },
  { aliases: ['soup', 'stew', 'broth', 'curry'], family: 'soups_stews_broths', confidence: 'medium', reason: 'Soups, stews, broths, and curries are tracked together.' },
  { aliases: ['sandwich', 'bowl', 'roll', 'taco', 'pizza', 'sushi'], family: 'mixed_dishes', confidence: 'medium', reason: 'Mixed dishes are tracked as assembled meals.' },
];

function containsAlias(normalizedName: string, alias: string) {
  const normalizedAlias = normalizeIngredientName(alias);
  if (!normalizedAlias) return false;
  if (normalizedName === normalizedAlias) return true;
  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalizedName);
}

@Injectable()
export class TaxonomyClassifierService {
  private readonly logger = new Logger('TaxonomyClassifier');

  constructor(private readonly config: ConfigService) {}

  classifyDeterministically(displayName: string): IngredientTaxonomyClassification {
    const normalized = normalizeIngredientName(displayName);
    for (const rule of RULES) {
      if (rule.aliases.some((alias) => containsAlias(normalized, alias))) {
        return makeTaxonomyClassification({
          primaryFoodFamilyKey: rule.family,
          digestivePatternKeys: rule.patterns,
          confidence: rule.confidence ?? 'medium',
          reason: rule.reason,
          source: 'deterministic',
        });
      }
    }

    return makeTaxonomyClassification({
      primaryFoodFamilyKey: 'unknown_unclassified',
      digestivePatternKeys: [],
      confidence: 'low',
      reason: 'No deterministic taxonomy rule matched this ingredient.',
      source: 'deterministic',
    });
  }

  async classifyIngredient(
    displayName: string,
    context?: string,
    options: { deadlineAt?: number } = {},
  ): Promise<IngredientTaxonomyClassification> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return this.classifyDeterministically(displayName);

    try {
      return await this.classifyWithOpenAi({ apiKey, displayName, context, deadlineAt: options.deadlineAt });
    } catch (error) {
      this.logger.warn({
        stage: 'ingredient_taxonomy_classification',
        code: error instanceof StructuredOutputError ? error.code : 'taxonomy_classification_failed',
        attemptCount: error instanceof StructuredOutputError ? error.attempts.length : 1,
        validationIssues: error instanceof StructuredOutputError ? error.validationIssues : [],
      }, 'taxonomy LLM classification failed; using deterministic fallback');
      return this.classifyDeterministically(displayName);
    }
  }

  async ensureClassifications(sql: Sql, insights: IngredientInsight[]) {
    const displayNameByNormalized = new Map<string, string>();
    for (const insight of insights) {
      const normalized = normalizeIngredientName(insight.ingredientName);
      if (normalized) displayNameByNormalized.set(normalized, insight.ingredientName);
    }
    const normalizedNames = [...displayNameByNormalized.keys()];
    if (!normalizedNames.length) return;

    const existingRows = await sql`
      select normalized_ingredient_name, primary_food_family_key, source, taxonomy_version
      from public.ingredient_taxonomy_classifications
      where normalized_ingredient_name = any(${normalizedNames})`;
    const existingByName = new Map<string, Record<string, unknown>>();
    for (const row of existingRows) {
      existingByName.set(String(row.normalized_ingredient_name), row);
    }

    const canUseLlm = Boolean(this.config.get<string>('OPENAI_API_KEY'));
    const phaseBudgetMs = positiveNumber(
      this.config.get<string>('OPENAI_TAXONOMY_PHASE_BUDGET_MS'),
      DEFAULT_CLASSIFICATION_PHASE_BUDGET_MS,
    );
    const phaseDeadline = Date.now() + phaseBudgetMs;
    const namesToClassify = normalizedNames.filter((name) => {
      const existing = existingByName.get(name);
      if (!existing) return true;
      if (existing.source === 'manual') return false;
      if (existing.taxonomy_version !== TAXONOMY_VERSION) return true;
      if (canUseLlm && existing.source === 'deterministic' && existing.primary_food_family_key === 'unknown_unclassified') {
        return true;
      }
      return false;
    });

    // Classifications are per-ingredient external calls (LLM or deterministic);
    // gather them first, then persist in a single bulk upsert. namesToClassify is
    // derived from a Map keyset, so normalized names are unique — safe for ON CONFLICT.
    const classificationRows = [];
    let llmClassificationCount = 0;
    for (const normalizedName of namesToClassify) {
      const displayName = displayNameByNormalized.get(normalizedName) ?? normalizedName;
      const useLlm = canUseLlm &&
        llmClassificationCount < MAX_LLM_CLASSIFICATIONS_PER_PHASE &&
        Date.now() < phaseDeadline;
      const classification = useLlm
        ? await this.classifyIngredient(displayName, undefined, { deadlineAt: phaseDeadline })
        : this.classifyDeterministically(displayName);
      if (useLlm) llmClassificationCount += 1;
      classificationRows.push({
        normalized_ingredient_name: normalizedName,
        display_name: displayName,
        primary_food_family_key: classification.primaryFoodFamilyKey,
        digestive_pattern_keys: sql.json(classification.digestivePatternKeys as never),
        confidence: classification.confidence,
        reason: classification.reason,
        taxonomy_version: classification.taxonomyVersion,
        model: classification.model ?? null,
        prompt_version: classification.promptVersion ?? null,
        source: classification.source,
      });
    }
    if (!classificationRows.length) return;

    await sql`
      insert into public.ingredient_taxonomy_classifications ${sql(
        classificationRows,
        'normalized_ingredient_name', 'display_name', 'primary_food_family_key',
        'digestive_pattern_keys', 'confidence', 'reason', 'taxonomy_version', 'model',
        'prompt_version', 'source',
      )}
      on conflict (normalized_ingredient_name) do update set
        display_name = excluded.display_name,
        primary_food_family_key = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.primary_food_family_key
          else excluded.primary_food_family_key
        end,
        digestive_pattern_keys = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.digestive_pattern_keys
          else excluded.digestive_pattern_keys
        end,
        confidence = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.confidence
          else excluded.confidence
        end,
        reason = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.reason
          else excluded.reason
        end,
        taxonomy_version = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.taxonomy_version
          else excluded.taxonomy_version
        end,
        model = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.model
          else excluded.model
        end,
        prompt_version = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.prompt_version
          else excluded.prompt_version
        end,
        source = case
          when ingredient_taxonomy_classifications.source = 'manual'
            then ingredient_taxonomy_classifications.source
          else excluded.source
        end,
        updated_at = now()`;
  }

  private async classifyWithOpenAi(input: {
    apiKey: string;
    displayName: string;
    context?: string;
    deadlineAt?: number;
  }): Promise<IngredientTaxonomyClassification> {
    const model = this.config.get<string>('OPENAI_TAXONOMY_MODEL') ?? this.config.get<string>('OPENAI_NORMALIZATION_MODEL') ?? 'gpt-4.1-mini';
    const timeoutMs = Number(this.config.get<string>('OPENAI_TAXONOMY_TIMEOUT_MS') ?? 15_000);

    const prompt = [
      'Classify this ingredient for a gut-health Trigger Profile.',
      'Use only the fixed keys provided. Do not invent keys.',
      'The classification is display/audit metadata only and does not change any health score.',
      'Choose exactly one primaryFoodFamilyKey. Choose zero or more digestivePatternKeys.',
      'If the ingredient is too ambiguous, use primaryFoodFamilyKey "unknown_unclassified" and confidence "low".',
      '',
      `Ingredient: ${input.displayName}`,
      input.context ? `Context: ${input.context}` : undefined,
      '',
      'Allowed digestive patterns:',
      JSON.stringify(DIGESTIVE_PATTERNS.map(({ key, label, mechanism, examples }) => ({ key, label, mechanism, examples }))),
      '',
      'Allowed tracked food families:',
      JSON.stringify(TRACKED_FOOD_FAMILIES.map(({ key, label, examples }) => ({ key, label, examples }))),
    ].filter(Boolean).join('\n');

    const result = await requestStructuredOutput({
      apiKey: input.apiKey,
      stage: 'ingredient_taxonomy_classification',
      timeoutMs,
      deadlineAt: input.deadlineAt,
      definition: taxonomyStructuredOutput,
      request: {
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: 'You classify foods into a strict JSON taxonomy. Return only schema-valid JSON.' }],
          },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
        text: { format: taxonomyStructuredOutput.format },
      },
    });
    return this.buildLlmClassification(result.value, model);
  }

  private buildLlmClassification(
    parsed: TaxonomyClassificationPayload,
    model: string,
  ): IngredientTaxonomyClassification {
    return makeTaxonomyClassification({
      primaryFoodFamilyKey: parsed.primaryFoodFamilyKey,
      digestivePatternKeys: parsed.digestivePatternKeys,
      confidence: parsed.confidence,
      reason: parsed.reason.slice(0, 500) || 'LLM taxonomy classification.',
      model,
      promptVersion: TAXONOMY_PROMPT_VERSION,
      source: 'llm',
    });
  }

  private validateLlmClassification(
    payload: unknown,
    model: string,
  ): IngredientTaxonomyClassification {
    const result = taxonomyClassificationSchema.safeParse(payload);
    if (!result.success) {
      const path = result.error.issues[0]?.path[0];
      if (path === 'primaryFoodFamilyKey') {
        throw new Error('taxonomy_invalid_primary_family');
      }
      if (path === 'digestivePatternKeys') {
        throw new Error('taxonomy_invalid_digestive_pattern');
      }
      throw result.error;
    }
    return this.buildLlmClassification(result.data, model);
  }
}

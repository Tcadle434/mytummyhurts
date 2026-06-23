// Golden eval cases. LOW/safe controls are first-class: a gentle dish reading
// risky (false positive) is as much a failure as a risky dish reading low
// (false negative / "app-deleting" per the original harness). Risk bands:
// low < 37, medium 37–63, high >= 64.
//
// IMPORTANT: with no OPENAI_API_KEY the extraction falls back to a deliberately
// CONSERVATIVE heuristic (flag-when-unsure), so plain-text foods score high.
// LOW/safe controls therefore carry a `structured` fixture so the runner can
// validate the deterministic SCORING layer offline; high_trigger cases need real
// LLM extraction (run with an API key).
import type { ExtractedIngredient, StructuredAnalysisV2 } from '../scan/engine/domain';

export interface GoldenCase {
  name: string;
  caseClass: 'high_trigger' | 'low_safe';
  text: string;
  profile: { conditions: string[]; sensitivities: string[] };
  expect: {
    riskBandMin: number;
    riskBandMax: number;
    expectedIngredients?: string[];
    forbiddenClaims?: string[];
  };
  needsLlm: boolean;
  // Deterministic structured input (bypasses extraction) for offline scoring evals.
  structured?: () => StructuredAnalysisV2;
}

const IBS_GERD = { conditions: ['IBS', 'GERD / Acid reflux'], sensitivities: [] };

function ing(name: string): ExtractedIngredient {
  return {
    rawName: name,
    canonicalName: name,
    confidence: 'high',
    component: null,
    evidence: 'visible',
    role: 'main',
    prominence: 'primary',
  } as unknown as ExtractedIngredient;
}

export const GOLDEN_CASES: GoldenCase[] = [
  // ---- LOW / safe controls (must read LOW; catch false positives) ----
  {
    name: 'plain_rice_low',
    caseClass: 'low_safe',
    text: 'plain white rice',
    profile: IBS_GERD,
    expect: { riskBandMin: 0, riskBandMax: 36 },
    needsLlm: false,
    structured: () => ({
      dishName: 'plain rice',
      dishConfidence: 'high',
      clarity: 'clear',
      components: [{ name: 'plain rice', confidence: 'high', prepStyle: ['steamed'] }],
      visibleIngredients: [ing('rice')],
      inferredIngredients: [],
      prepStyle: ['steamed'],
      notes: [],
      baseFoodCategory: { key: 'non_wheat_grain_based', confidence: 'high', evidence: 'ingredient', source: 'rice' },
      riskModifiers: [
        { key: 'rice_or_simple_starch', confidence: 'high', evidence: 'ingredient', source: 'rice' },
        { key: 'plain_or_lightly_seasoned', confidence: 'high', evidence: 'prep', source: 'plain' },
        { key: 'simple_prep', confidence: 'high', evidence: 'prep', source: 'steamed' },
      ],
      model: 'fixture',
      promptVersion: 'fixture',
      imageDetail: 'high',
    }) as unknown as StructuredAnalysisV2,
  },
  {
    name: 'grilled_chicken_low',
    caseClass: 'low_safe',
    text: 'plain grilled chicken breast',
    profile: IBS_GERD,
    expect: { riskBandMin: 0, riskBandMax: 36 },
    needsLlm: false,
    structured: () => ({
      dishName: 'grilled chicken breast',
      dishConfidence: 'high',
      clarity: 'clear',
      components: [{ name: 'grilled chicken breast', confidence: 'high', prepStyle: ['grilled'] }],
      visibleIngredients: [ing('chicken breast')],
      inferredIngredients: [],
      prepStyle: ['grilled'],
      notes: [],
      baseFoodCategory: { key: 'lean_meat_poultry', confidence: 'high', evidence: 'ingredient', source: 'chicken' },
      riskModifiers: [
        { key: 'lean_protein', confidence: 'high', evidence: 'ingredient', source: 'chicken' },
        { key: 'plain_or_lightly_seasoned', confidence: 'high', evidence: 'prep', source: 'plain' },
        { key: 'simple_prep', confidence: 'high', evidence: 'prep', source: 'grilled' },
      ],
      model: 'fixture',
      promptVersion: 'fixture',
      imageDetail: 'high',
    }) as unknown as StructuredAnalysisV2,
  },
  {
    name: 'cucumber_low',
    caseClass: 'low_safe',
    text: 'sliced cucumber',
    profile: IBS_GERD,
    expect: { riskBandMin: 0, riskBandMax: 36 },
    needsLlm: false,
  },

  // ---- HIGH-trigger goldens (need LLM extraction) ----
  { name: 'garlic_ibs_high', caseClass: 'high_trigger', text: 'pasta heavily loaded with garlic and onion', profile: { conditions: ['IBS'], sensitivities: ['Garlic'] }, expect: { riskBandMin: 45, riskBandMax: 100, expectedIngredients: ['garlic'], forbiddenClaims: ['cures', 'diagnose', 'safe for everyone'] }, needsLlm: true },
  { name: 'spicy_gerd_high', caseClass: 'high_trigger', text: 'extra spicy buffalo wings with hot sauce', profile: { conditions: ['GERD / Acid reflux'], sensitivities: [] }, expect: { riskBandMin: 45, riskBandMax: 100 }, needsLlm: true },
  { name: 'dairy_lactose_high', caseClass: 'high_trigger', text: 'a large milkshake made with ice cream and whole milk', profile: { conditions: [], sensitivities: ['Dairy'] }, expect: { riskBandMin: 45, riskBandMax: 100, expectedIngredients: ['milk'] }, needsLlm: true },
  { name: 'fried_reflux_high', caseClass: 'high_trigger', text: 'deep fried chicken with greasy french fries', profile: { conditions: ['GERD / Acid reflux'], sensitivities: [] }, expect: { riskBandMin: 45, riskBandMax: 100 }, needsLlm: true },
  { name: 'tomato_gerd_high', caseClass: 'high_trigger', text: 'pasta with a rich tomato marinara sauce', profile: { conditions: ['GERD / Acid reflux'], sensitivities: ['Tomato'] }, expect: { riskBandMin: 40, riskBandMax: 100, expectedIngredients: ['tomato'] }, needsLlm: true },
];

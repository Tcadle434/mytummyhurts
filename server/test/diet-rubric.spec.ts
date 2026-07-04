import { describe, expect, it } from 'vitest';

import { evaluateDietForStructuredAnalysis } from '../src/scan/engine/dietRubric';
import type { DietPreference, StructuredAnalysisV2 } from '../src/scan/engine/domain';

const ANTI_INFLAMMATORY: DietPreference = {
  key: 'anti_inflammatory',
  label: 'Anti-inflammatory',
  strictness: 'standard',
  source: 'onboarding',
};

function sushiAnalysis(overrides: Partial<StructuredAnalysisV2> = {}): StructuredAnalysisV2 {
  return {
    dishName: 'salmon avocado sushi rolls',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: [
      { rawName: 'salmon', canonicalName: 'salmon', confidence: 'high', evidence: 'visible' },
      { rawName: 'avocado', canonicalName: 'avocado', confidence: 'high', evidence: 'visible' },
      { rawName: 'rice', canonicalName: 'rice', confidence: 'high', evidence: 'visible' },
    ],
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    baseFoodCategory: { key: 'lean_seafood', confidence: 'high', source: 'salmon' },
    // The extraction flags avocado's fat load — a correct FOOD fact that must
    // no longer be allowed to overrule the model's DIET verdict.
    riskModifiers: [{ key: 'high_fat_or_rich', confidence: 'high', source: 'avocado' }],
    dietFitHypotheses: [
      {
        dietKey: 'anti_inflammatory',
        status: 'fits',
        confidence: 'high',
        evidence: ['salmon', 'vegetables'],
        conflicts: [],
        missingInfo: [],
        reason:
          'The salmon and vegetables fit an anti-inflammatory pattern, though white rice and soy sauce make it less ideal than a fully whole-food meal.',
      },
    ],
    ...overrides,
  } as unknown as StructuredAnalysisV2;
}

describe('diet fit — the LLM verdict is the source of truth', () => {
  // Regression for the founder's live scan (2026-07-04): model said fits with
  // a nuanced reason; the rubric's high_fat_or_rich conflict flipped it to
  // does_not_fit "because of avocado".
  it('keeps the model fits verdict even when rubric conflict signals fire', () => {
    const [evaluation] = evaluateDietForStructuredAnalysis(sushiAnalysis(), [ANTI_INFLAMMATORY]);

    expect(evaluation!.status).toBe('fits');
    expect(evaluation!.acceptedModelStatus).toBe(true);
    expect(evaluation!.confidence).toBe('high');
    expect(evaluation!.reason).toContain('salmon and vegetables fit an anti-inflammatory pattern');
    expect(evaluation!.reason).not.toContain('because of avocado');
    // Rubric signals remain visible as displayed factors.
    expect(evaluation!.conflicts).toContain('avocado');
    expect(evaluation!.modelStatus).toBe('fits');
  });

  it('uses the model does_not_fit verdict and reason too — trust cuts both ways', () => {
    const [evaluation] = evaluateDietForStructuredAnalysis(
      sushiAnalysis({
        dietFitHypotheses: [
          {
            dietKey: 'anti_inflammatory',
            status: 'does_not_fit',
            confidence: 'medium',
            evidence: [],
            conflicts: ['deep-fried batter'],
            missingInfo: [],
            reason: 'Deep-fried batter dominates the dish, which conflicts with an anti-inflammatory pattern.',
          },
        ],
      } as Partial<StructuredAnalysisV2>),
      [ANTI_INFLAMMATORY],
    );

    expect(evaluation!.status).toBe('does_not_fit');
    expect(evaluation!.acceptedModelStatus).toBe(true);
    expect(evaluation!.reason).toContain('Deep-fried batter dominates');
  });

  it('falls back to the deterministic rubric when no hypothesis exists', () => {
    const [evaluation] = evaluateDietForStructuredAnalysis(
      sushiAnalysis({ dietFitHypotheses: [] } as Partial<StructuredAnalysisV2>),
      [ANTI_INFLAMMATORY],
    );

    // Deterministic path unchanged: high_fat_or_rich still drives the verdict
    // when the model was never asked.
    expect(evaluation!.acceptedModelStatus).toBe(false);
    expect(['does_not_fit', 'caution']).toContain(evaluation!.status);
    expect(evaluation!.reason).toContain('Anti-inflammatory');
  });
});

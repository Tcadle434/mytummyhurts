import { describe, expect, it } from 'vitest';

import { buildModelConditionTargets } from '../src/scan/engine/conditionTargets';
import {
  buildImageUserPrompt,
  buildMenuAnalysisUserPrompt,
} from '../src/scan/engine/openaiPrompts';

describe('active scan prompts', () => {
  it('gives the primary food-band call symptom context and combined-meal guidance', () => {
    const prompt = buildImageUserPrompt({
      knownConditions: ['Unsure, just general discomfort'],
      knownIngredients: [],
      commonSymptoms: ['Gas'],
    }, true);

    expect(prompt).toContain('Relevant symptom context: Gas');
    expect(prompt).toContain('Judge the complete meal burden');
    expect(prompt).toContain('dense meal with a meaningful rich or high-fat component');
    expect(prompt).toContain('plain rice or simple starch are neutral or mitigating');
    expect(prompt).toContain('Rice-heavy salmon-avocado sushi for general gas sensitivity');
    expect(prompt).toContain('never treat them as diagnoses');
  });

  it('uses stable condition keys for batched menu judgments', () => {
    const targets = buildModelConditionTargets(['Unsure, just general discomfort']);
    const prompt = buildMenuAnalysisUserPrompt([{
      id: 'item-1',
      name: 'Butter chicken with rice',
      description: 'Rich tomato cream curry',
      section: 'Mains',
    }], {
      knownConditions: ['Unsure, just general discomfort'],
      knownIngredients: [],
      commonSymptoms: ['Gas'],
    }, targets);

    expect(targets).toEqual([{
      key: 'general_discomfort',
      label: 'Unsure, just general discomfort',
    }]);
    expect(prompt).toContain('"key":"general_discomfort"');
    expect(prompt).toContain('using conditionKey exactly as supplied');
    expect(prompt).toContain('Relevant symptom context: Gas');
  });
});

import { describe, expect, it } from 'vitest';

import {
  EVAL_CONTEXTS,
  bandMatch,
  bandMeansFromOutcomes,
  bandOrdinal,
  buildExamples,
  buildExperimentMetadata,
  buildExperimentName,
  createExperimentReporter,
  evaluateDriftAlarm,
  expectationPass,
  langsmithKeyPresent,
  meanBandDrift,
  normalizeContext,
  overallRiskScore,
  scoreInRange,
  syncDataset,
  validateExpectation,
} from '../scripts/eval/langsmith-lib.mjs';

const profilesDoc = {
  profiles: {
    ibs: { description: 'IBS', knownConditions: ['IBS'] },
    gerd: { description: 'GERD', knownConditions: ['GERD'] },
  },
};

const casesDoc = {
  cases: [
    {
      id: 'pizza_001',
      description: 'Pepperoni pizza',
      image: 'images/pizza_001.jpg',
      expectations: [
        { profile: 'ibs', expectedBands: ['high'], expectedScoreRange: [64, 90] },
        { profile: 'gerd', expectedBands: ['high'], expectedScoreRange: [64, 92] },
      ],
    },
    { id: 'salad_001', description: 'Plain salad', image: 'images/salad_001.jpg', enabled: false, expectations: [] },
  ],
};

describe('buildExamples', () => {
  it('produces one example per (case, expectation) with a stable key', () => {
    // Arrange / Act
    const examples = buildExamples(casesDoc, profilesDoc);

    // Assert
    expect(examples).toHaveLength(2);
    expect(examples.map((e) => e.key)).toEqual(['pizza_001::ibs', 'pizza_001::gerd']);
    expect(examples[0].inputs).toMatchObject({ caseId: 'pizza_001', profileKey: 'ibs', image: 'images/pizza_001.jpg' });
    expect(examples[0].inputs.profile).toEqual(profilesDoc.profiles.ibs);
    expect(examples[0].outputs.expectation.expectedBands).toEqual(['high']);
  });

  it('skips disabled cases', () => {
    const ids = new Set(buildExamples(casesDoc, profilesDoc).map((e) => e.inputs.caseId));
    expect(ids.has('salad_001')).toBe(false);
  });

  it('filters by selected case ids', () => {
    const examples = buildExamples(casesDoc, profilesDoc, new Set(['nope']));
    expect(examples).toHaveLength(0);
  });

  it('throws on an unknown profile', () => {
    const bad = { cases: [{ id: 'x', image: 'i', expectations: [{ profile: 'missing' }] }] };
    expect(() => buildExamples(bad, profilesDoc)).toThrow(/Unknown profile "missing"/);
  });
});

describe('deterministic evaluators', () => {
  const ref = { expectation: { expectedBands: ['high'], expectedScoreRange: [64, 90] } };

  it('bandMatch scores 1 when the band matches, 0 otherwise, null when unspecified', () => {
    expect(bandMatch({ outputs: { level: 'high', score: 70 }, referenceOutputs: ref }).score).toBe(1);
    expect(bandMatch({ outputs: { level: 'low', score: 20 }, referenceOutputs: ref }).score).toBe(0);
    expect(bandMatch({ outputs: { level: 'high' }, referenceOutputs: { expectation: {} } }).score).toBeNull();
  });

  it('scoreInRange respects inclusive bounds', () => {
    expect(scoreInRange({ outputs: { score: 64 }, referenceOutputs: ref }).score).toBe(1);
    expect(scoreInRange({ outputs: { score: 90 }, referenceOutputs: ref }).score).toBe(1);
    expect(scoreInRange({ outputs: { score: 91 }, referenceOutputs: ref }).score).toBe(0);
    expect(scoreInRange({ outputs: { score: 50 }, referenceOutputs: { expectation: {} } }).score).toBeNull();
  });

  it('overallRiskScore surfaces the raw numeric score for trend tracking', () => {
    expect(overallRiskScore({ outputs: { score: 73 } }).score).toBe(73);
    expect(overallRiskScore({ outputs: {} }).score).toBeNull();
  });

  it('expectationPass mirrors the canonical validation (pass in-band+range, fail out)', () => {
    expect(expectationPass({ outputs: { level: 'high', score: 72 }, referenceOutputs: ref }).score).toBe(1);
    const fail = expectationPass({ outputs: { level: 'low', score: 20 }, referenceOutputs: ref });
    expect(fail.score).toBe(0);
    expect(fail.comment).toMatch(/band|score/i);
  });
});

describe('context tagging', () => {
  it('defaults to triage when no context is given', () => {
    expect(normalizeContext(undefined)).toBe('triage');
    expect(normalizeContext(null)).toBe('triage');
    expect(normalizeContext('')).toBe('triage');
  });

  it('accepts every known context unchanged', () => {
    expect(EVAL_CONTEXTS).toEqual(['triage', 'ci-gate', 'nightly', 'baseline']);
    for (const context of EVAL_CONTEXTS) {
      expect(normalizeContext(context)).toBe(context);
    }
  });

  it('rejects unknown contexts loudly instead of polluting the dataset', () => {
    expect(() => normalizeContext('deploy')).toThrow(/--context must be one of/);
    expect(() => normalizeContext('CI-GATE')).toThrow(/got "CI-GATE"/);
  });
});

describe('experiment naming', () => {
  it('derives the head from the extraction model and appends context + suffix', () => {
    // Arrange / Act
    const name = buildExperimentName({
      extractionModel: 'gpt-5.4-mini',
      context: 'ci-gate',
      suffix: '20260703T211500-ab12cd34',
    });

    // Assert
    expect(name).toBe('mth-golden-gpt-5.4-mini-ci-gate-20260703T211500-ab12cd34');
  });

  it('an explicit prefix replaces the derived head', () => {
    const name = buildExperimentName({
      prefix: 'custom-run',
      extractionModel: 'gpt-5.4-mini',
      context: 'nightly',
      suffix: 'x1',
    });
    expect(name).toBe('custom-run-nightly-x1');
  });

  it('skips empty parts so partial identities still form a valid name', () => {
    expect(buildExperimentName({ prefix: 'p', context: 'triage' })).toBe('p-triage');
    expect(buildExperimentName({ prefix: '  ', extractionModel: 'm', context: 'triage' })).toBe('mth-golden-m-triage');
  });
});

describe('experiment metadata', () => {
  it('tags context, api, and model/prompt versions from env', () => {
    // Arrange
    const env = {
      OPENAI_EXTRACTION_MODEL: 'gpt-x',
      OPENAI_MENU_TRANSCRIPTION_MODEL: 'gpt-menu-vision',
      OPENAI_MENU_ANALYSIS_MODEL: 'gpt-menu-text',
      OPENAI_EXTRACTION_PROMPT_VERSION: 'v9',
      OPENAI_MENU_PROMPT_VERSION: 'menu-v5',
    };

    // Act
    const metadata = buildExperimentMetadata({ api: 'http://localhost:3000', context: 'nightly', env });

    // Assert
    expect(metadata).toMatchObject({
      api: 'http://localhost:3000',
      context: 'nightly',
      extractionModel: 'gpt-x',
      menuModel: 'gpt-menu-text',
      menuTranscriptionModel: 'gpt-menu-vision',
      menuAnalysisModel: 'gpt-menu-text',
      extractionPromptVersion: 'v9',
      menuPromptVersion: 'menu-v5',
      commitSha: 'unknown',
      ragRetrievalEnabled: 'false',
    });
  });

  it('falls back to the current defaults with an empty env', () => {
    const metadata = buildExperimentMetadata({ api: 'x', context: 'triage', env: {} });
    expect(metadata.extractionModel).toBe('gpt-5.4-mini');
    expect(metadata.menuModel).toBe('gpt-5.4-mini');
    expect(metadata.menuTranscriptionModel).toBe('gpt-5.4-mini');
    expect(metadata.menuAnalysisModel).toBe('gpt-5.4-mini');
    expect(metadata.extractionPromptVersion).toBe('n/a');
  });
});

describe('multi-modal expectation validation', () => {
  it('validates menu routing, page count, item coverage, score spread, and false-low guards', () => {
    const expectation = {
      expectedScanCategory: 'menu',
      menu: {
        inputPageCount: 2,
        minItems: 3,
        requiredNamePatterns: ['tempura'],
        falseLowNamePatterns: ['fried'],
        falseLowMinScore: 37,
        minScoreSpread: 25,
      },
    };
    const run = {
      scanCategory: 'menu',
      score: 50,
      level: 'medium',
      menu: {
        inputPageCount: 2,
        items: [
          { name: 'Plain Rice', riskScore: 10 },
          { name: 'Shrimp Tempura', riskScore: 65 },
          { name: 'Fried Roll', riskScore: 70 },
        ],
      },
    };
    expect(validateExpectation(expectation, [run], [])).toMatchObject({ passed: true });
  });

  it('fails unsafe menu output and an incorrect router category', () => {
    const result = validateExpectation(
      {
        expectedScanCategory: 'menu',
        menu: { minItems: 2, falseLowNamePatterns: ['fried'], falseLowMinScore: 37 },
      },
      [{ scanCategory: 'food', score: 10, level: 'low', menu: { items: [{ name: 'Fried Roll', riskScore: 5 }] } }],
      [],
    );
    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/scan category/);
    expect(result.errors.join(' ')).toMatch(/below 37/);
  });

  it('validates the safe unclear fallback for non-food inputs', () => {
    expect(
      validateExpectation(
        { expectedScanCategory: 'food', expectedClarity: 'unclear' },
        [{ scanCategory: 'food', clarity: 'unclear', score: 0, level: 'low' }],
        [],
      ).passed,
    ).toBe(true);
  });
});

describe('key-absent skip', () => {
  it('langsmithKeyPresent treats missing and blank keys as absent', () => {
    expect(langsmithKeyPresent({})).toBe(false);
    expect(langsmithKeyPresent({ LANGSMITH_API_KEY: '' })).toBe(false);
    expect(langsmithKeyPresent({ LANGSMITH_API_KEY: '   ' })).toBe(false);
    expect(langsmithKeyPresent({ LANGSMITH_API_KEY: 'ls-key' })).toBe(true);
  });

  it('createExperimentReporter resolves null without a key (no SDK import, no network)', async () => {
    const reporter = await createExperimentReporter({
      env: {},
      api: 'http://localhost:3000',
      examples: [],
      context: 'triage',
      suffix: 's1',
    });
    expect(reporter).toBeNull();
  });
});

describe('LangSmith dataset synchronization', () => {
  it('updates changed expectations instead of retaining stale reference outputs', async () => {
    const updates: unknown[] = [];
    const client = {
      hasDataset: async () => true,
      readDataset: async () => ({ id: 'dataset-1' }),
      async *listExamples() {
        yield {
          id: 'example-1',
          inputs: { caseId: 'pizza_001', profileKey: 'ibs', profile: {} },
          outputs: { expectation: { expectedBands: ['low'] } },
        };
      },
      createExamples: async () => [],
      updateExample: async (id: string, update: unknown) => updates.push({ id, update }),
    };
    const examples = [{
      key: 'pizza_001::ibs',
      inputs: { profile: {}, profileKey: 'ibs', caseId: 'pizza_001' },
      outputs: { expectation: { expectedBands: ['high'] } },
    }];

    const result = await syncDataset(client, 'dataset', examples);

    expect(result).toMatchObject({ added: 0, updated: 1, total: 1 });
    expect(updates).toEqual([{
      id: 'example-1',
      update: {
        inputs: examples[0].inputs,
        outputs: examples[0].outputs,
      },
    }]);
  });
});

describe('band drift alarm', () => {
  it('bandOrdinal maps risk levels to ordinals and rejects junk', () => {
    expect(bandOrdinal('low')).toBe(0);
    expect(bandOrdinal('medium')).toBe(1);
    expect(bandOrdinal('high')).toBe(2);
    expect(bandOrdinal('severe')).toBeNull();
    expect(bandOrdinal(undefined)).toBeNull();
  });

  it('bandMeansFromOutcomes averages repeated runs per example key', () => {
    // Arrange
    const rows = [
      { key: 'pizza::gerd', level: 'high' },
      { key: 'pizza::gerd', level: 'medium' },
      { key: 'rice::ibs', level: 'low' },
      { key: 'broken::x', level: 'unknown' },
    ];

    // Act
    const { perKey } = bandMeansFromOutcomes(rows);

    // Assert
    expect(perKey['pizza::gerd']).toBe(1.5);
    expect(perKey['rice::ibs']).toBe(0);
    expect(perKey['broken::x']).toBeUndefined();
  });

  it('meanBandDrift compares only shared keys and signs the direction', () => {
    const baseline = { 'a::p': 0, 'b::p': 1, 'gone::p': 2 };
    const current = { 'a::p': 1, 'b::p': 2, 'new::p': 0 };

    const { meanDrift, sharedKeys, perKeyDrift } = meanBandDrift(baseline, current);

    expect(sharedKeys).toBe(2);
    expect(meanDrift).toBe(1);
    expect(perKeyDrift).toEqual({ 'a::p': 1, 'b::p': 1 });
  });

  it('evaluateDriftAlarm exits 1 only past a whole band of mean drift', () => {
    const baseline = { perKey: { 'a::p': 0, 'b::p': 0 } };
    const calm = evaluateDriftAlarm(baseline, { perKey: { 'a::p': 1, 'b::p': 0 } });
    expect(calm.exitCode).toBe(0);
    expect(calm.meanDrift).toBe(0.5);

    const loud = evaluateDriftAlarm(baseline, { perKey: { 'a::p': 2, 'b::p': 1.5 } });
    expect(loud.exitCode).toBe(1);
    expect(loud.meanDrift).toBe(1.75);
  });

  it('evaluateDriftAlarm never fires with no shared keys (fresh baseline)', () => {
    const result = evaluateDriftAlarm({ perKey: {} }, { perKey: { 'a::p': 2 } });
    expect(result.exitCode).toBe(0);
    expect(result.sharedKeys).toBe(0);
  });
});

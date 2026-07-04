import { describe, expect, it } from 'vitest';

import type { IngredientInsight, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import {
  buildRiskAdjudicationRequest,
  validateRiskAdjudication,
  type RiskAdjudicationPayload,
} from '../src/scan/engine/riskAdjudication';

function structured(): StructuredAnalysisV2 {
  return {
    dishName: 'sub sandwich',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: [
      {
        rawName: 'sub roll',
        canonicalName: 'bread',
        confidence: 'high',
        component: 'bread',
        evidence: 'visible',
        role: 'base',
        prominence: 'primary',
      },
      {
        rawName: 'cheese slices',
        canonicalName: 'cheese',
        confidence: 'high',
        component: 'cheese',
        evidence: 'visible',
        role: 'main',
        prominence: 'secondary',
      },
    ],
    inferredIngredients: [],
    prepStyle: ['assembled'],
    notes: [],
    riskModifiers: [{ key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bread' }],
    conditionSeverities: [{ condition: 'IBS', band: 'moderate', drivers: ['bread'], rationale: 'Generic wheat watch-out.' }],
    dietFitHypotheses: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
}

function insight(overrides: Partial<IngredientInsight> = {}): IngredientInsight {
  return {
    id: 'insight-wheat',
    ingredientName: 'wheat',
    triggerScore: 2,
    safeScore: 24,
    combinedRiskScore: 28,
    confidenceLevel: 'high',
    patternStrength: 'weak',
    linkedConditions: ['IBS'],
    supportingEvidenceCount: 10,
    positiveEvidenceCount: 10,
    negativeEvidenceCount: 0,
    sourceBreakdown: {
      declared: false,
      science: true,
      personal: true,
      positiveEvidenceCount: 10,
      negativeEvidenceCount: 0,
    },
    lastRecomputedAt: '2026-06-24T00:00:00.000Z',
    summary: 'Wheat has appeared mostly around calmer daily reports.',
    ...overrides,
  };
}

function ibsProfile() {
  return {
    userId: 'u',
    knownConditions: ['IBS'],
    knownIngredientSensitivities: [],
    commonSymptoms: [],
    mealContexts: [],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
    dietPreferences: [],
    stomachProfile: {
      version: 3,
      conditions: [],
      declaredIngredientSensitivities: [],
      ingredientScores: {},
      conditionSensitivityWeights: {},
      freeformCustomNotes: [],
      metadata: { profileConfidenceLevel: 'confident', reportCount: 10, learnedIngredientCount: 1, topTriggers: [], topSafeFoods: [], declaredSensitivities: [] },
    },
  } as const;
}

function payload(
  finalBand: 'none' | 'mild' | 'moderate' | 'high' | 'severe',
  citationChunkIds = ['chunk-1'],
): RiskAdjudicationPayload {
  return {
    conditionSeverities: [
      {
        condition: 'IBS',
        genericBand: 'moderate',
        personalizedBand: finalBand,
        finalBand,
        drivers: ['bread'],
        protectiveEvidence: ['repeated calm wheat days'],
        citationChunkIds,
        personalEvidenceUsed: ['10 calm wheat days'],
        confidence: 'high',
        rationale: 'Generic wheat risk is moderated by this user’s repeated calm evidence.',
      },
    ],
  };
}

describe('risk adjudication validation', () => {
  it('accepts adjudicated bands with valid ingredients, citations, and high-confidence personal evidence', () => {
    const input = buildRiskAdjudicationRequest({
      structuredAnalysis: structured(),
      profile: ibsProfile(),
      insights: [insight()],
      ragEvidence: [
        {
          chunkId: 'chunk-1',
          title: 'IBS wheat evidence',
          source: 'Curated reference',
          content: 'Wheat can contribute fructans for IBS.',
          conditionTags: ['IBS'],
          ingredientTags: ['wheat'],
          direction: 'raises',
          relevanceScore: 0.8,
        },
      ],
    });

    const out = validateRiskAdjudication(payload('mild'), input, { source: 'llm', ragRetrievalRunId: 'rag-1' });
    expect(out?.conditionSeverities[0]).toMatchObject({ condition: 'IBS', band: 'mild', drivers: ['bread'] });
    expect(out?.metadata.ragRetrievalRunId).toBe('rag-1');
    expect(out?.evidenceCitations[0].chunkId).toBe('chunk-1');
  });

  it('drops invented citation ids without rejecting otherwise valid adjudication', () => {
    const input = buildRiskAdjudicationRequest({
      structuredAnalysis: structured(),
      profile: ibsProfile(),
      insights: [insight()],
      ragEvidence: [
        {
          chunkId: 'chunk-1',
          title: 'IBS wheat evidence',
          source: 'Curated reference',
          content: 'Wheat can contribute fructans for IBS.',
          conditionTags: ['IBS'],
          ingredientTags: ['wheat'],
          direction: 'raises',
          relevanceScore: 0.8,
        },
      ],
    });
    const out = validateRiskAdjudication(payload('mild', ['chunk-1', 'bad-citation-id']), input);
    expect(out?.conditionSeverities[0]).toMatchObject({ condition: 'IBS', band: 'mild' });
    expect(out?.metadata.conditionSeverities[0].citationChunkIds).toEqual(['chunk-1']);
    expect(out?.metadata.warnings?.[0]).toContain('invalidCitationIdsDropped:bad-citation-id');
  });

  it('maps short prompt citation ids back to durable chunk ids', () => {
    const input = buildRiskAdjudicationRequest({
      structuredAnalysis: structured(),
      profile: ibsProfile(),
      insights: [insight()],
      ragEvidence: [
        {
          chunkId: 'durable-chunk-id',
          title: 'IBS wheat evidence',
          source: 'Curated reference',
          content: 'Wheat can contribute fructans for IBS.',
          conditionTags: ['IBS'],
          ingredientTags: ['wheat'],
          direction: 'raises',
          relevanceScore: 0.8,
        },
      ],
    });
    const out = validateRiskAdjudication(payload('mild', ['cite-0']), input);
    expect(out?.metadata.conditionSeverities[0].citationChunkIds).toEqual(['durable-chunk-id']);
    expect(out?.evidenceCitations[0]).toMatchObject({ id: 'cite-0', chunkId: 'durable-chunk-id' });
  });

  it('clamps weak personal evidence back to the generic band', () => {
    const input = buildRiskAdjudicationRequest({
      structuredAnalysis: {
        ...structured(),
        dishName: 'wheat pasta',
        baseFoodCategory: {
          key: 'wheat_grain_based',
          confidence: 'high',
          evidence: 'ingredient',
          source: 'wheat pasta',
        },
      },
      profile: ibsProfile(),
      insights: [insight({ confidenceLevel: 'low', supportingEvidenceCount: 1, positiveEvidenceCount: 1, safeScore: 10 })],
      ragEvidence: [{ chunkId: 'chunk-1', title: 'x', source: 'x', content: 'x', conditionTags: [], ingredientTags: [], direction: 'neutral', relevanceScore: 0.3 }],
    });
    const out = validateRiskAdjudication(payload('mild'), input);
    expect(out?.conditionSeverities[0].band).toBe('moderate');
  });

  it('allows medium personal evidence to move one band and high evidence to move two', () => {
    const mediumInput = buildRiskAdjudicationRequest({
      structuredAnalysis: structured(),
      profile: ibsProfile(),
      insights: [insight({ confidenceLevel: 'medium', supportingEvidenceCount: 4 })],
      ragEvidence: [{ chunkId: 'chunk-1', title: 'x', source: 'x', content: 'x', conditionTags: [], ingredientTags: [], direction: 'neutral', relevanceScore: 0.3 }],
    });
    const medium = validateRiskAdjudication(payload('none'), mediumInput);
    expect(medium?.conditionSeverities[0].band).toBe('mild');

    const highInput = buildRiskAdjudicationRequest({
      structuredAnalysis: structured(),
      profile: ibsProfile(),
      insights: [insight({ confidenceLevel: 'high', supportingEvidenceCount: 8 })],
      ragEvidence: [{ chunkId: 'chunk-1', title: 'x', source: 'x', content: 'x', conditionTags: [], ingredientTags: [], direction: 'neutral', relevanceScore: 0.3 }],
    });
    const high = validateRiskAdjudication(payload('none'), highInput);
    expect(high?.conditionSeverities[0].band).toBe('none');
  });
});

// Regression for the live 2026-07-04 sushi scans: the text-only adjudicator
// first re-derived GERD genericBand=moderate over the vision model's mild
// (citing a histamine chunk — wrong condition), lifting 31->55. A ±1-with-
// citation allowance was tried and inflated everything (the corpus has a
// raises chunk for nearly every trigger). Final rule: the generic band IS the
// vision prior; the adjudicator's only band lever is personal evidence.
describe('generic band is pinned to the vision prior', () => {
  const gerdChunk = {
    chunkId: 'chunk-gerd',
    title: 'Fat and Fried Foods — Reflux',
    source: 'Curated reference',
    content: 'Fat delays gastric emptying and relaxes the LES.',
    conditionTags: ['GERD'],
    ingredientTags: ['fried', 'fat', 'avocado'],
    direction: 'raises' as const,
    relevanceScore: 0.6,
  };
  const histamineChunk = {
    chunkId: 'chunk-hist',
    title: 'Histamine, Aged and Fermented Foods',
    source: 'Curated reference',
    content: 'Fermented foods like soy sauce carry histamine.',
    conditionTags: ['histamine_intolerance'],
    ingredientTags: ['soy sauce', 'fermented'],
    direction: 'raises' as const,
    relevanceScore: 0.6,
  };

  function gerdStructured(): StructuredAnalysisV2 {
    return {
      ...structured(),
      conditionSeverities: [
        { condition: 'GERD / Acid reflux', band: 'mild', drivers: ['cheese'], rationale: 'Vision prior.' },
      ],
    };
  }

  function gerdPayload(genericBand: 'mild' | 'moderate' | 'high', citationChunkIds: string[]): RiskAdjudicationPayload {
    return {
      conditionSeverities: [
        {
          condition: 'GERD / Acid reflux',
          genericBand,
          personalizedBand: genericBand,
          finalBand: genericBand,
          drivers: ['cheese'],
          protectiveEvidence: [],
          citationChunkIds,
          personalEvidenceUsed: [],
          confidence: 'medium',
          rationale: 'test',
        },
      ],
    };
  }

  function gerdRequest(ragEvidence: (typeof gerdChunk)[]) {
    return buildRiskAdjudicationRequest({
      structuredAnalysis: gerdStructured(),
      profile: { ...ibsProfile(), knownConditions: ['GERD / Acid reflux'] },
      insights: [],
      ragEvidence,
    });
  }

  it('rejects an upward move justified by a wrong-condition citation (the sushi bug)', () => {
    const result = validateRiskAdjudication(gerdPayload('moderate', ['chunk-hist']), gerdRequest([histamineChunk]));
    expect(result?.conditionSeverities[0].band).toBe('mild');
    expect(result?.metadata.warnings?.some((w) => w.startsWith('genericBandClamped'))).toBe(true);
  });

  it('rejects an upward move even with a condition-matching raises citation (the inflation bug)', () => {
    const result = validateRiskAdjudication(gerdPayload('moderate', ['chunk-gerd']), gerdRequest([gerdChunk]));
    expect(result?.conditionSeverities[0].band).toBe('mild');
    expect(result?.metadata.warnings?.some((w) => w.startsWith('genericBandClamped'))).toBe(true);
  });

  it('rejects downward generic moves too — the prior is the prior', () => {
    const result = validateRiskAdjudication(gerdPayload('mild', []), {
      ...gerdRequest([]),
      structuredAnalysis: {
        ...gerdStructured(),
        conditionSeverities: [
          { condition: 'GERD / Acid reflux', band: 'moderate', drivers: ['cheese'], rationale: 'Vision prior.' },
        ],
      },
    });
    expect(result?.conditionSeverities[0].band).toBe('moderate');
  });

  it('personal evidence remains the only band lever, applied on the pinned prior', () => {
    const request = {
      ...gerdRequest([]),
      personalEvidence: [
        {
          ingredientName: 'cheese',
          combinedRiskScore: 70,
          confidenceLevel: 'medium' as const,
          supportingEvidenceCount: 4,
          calmEvidenceCount: 0,
          reactiveEvidenceCount: 3,
          summary: 'rough on 3 of 4 days',
        },
      ],
    };
    const payload = gerdPayload('moderate', []);
    payload.conditionSeverities[0]!.personalEvidenceUsed = ['cheese'];
    payload.conditionSeverities[0]!.finalBand = 'moderate';
    const result = validateRiskAdjudication(payload, request);
    // generic pinned to mild; medium-confidence personal evidence allows +1.
    expect(result?.metadata.conditionSeverities[0]!.genericBand).toBe('mild');
    expect(result?.conditionSeverities[0].band).toBe('moderate');
  });
});

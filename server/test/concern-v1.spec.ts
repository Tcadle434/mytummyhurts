import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ConcernConditionContext,
  ConcernEvidenceClaim,
  ConcernMechanismMap,
  ConcernSubject,
  ConcernSubjectDecision,
  ConcernSubjectVerification,
} from '../src/scan/concern-v1/domain';
import { loadConcernEvidenceCatalog } from '../src/scan/concern-v1/evidence';
import { resolveConcernConditions } from '../src/scan/concern-v1/profile';
import { retrieveConcernEvidence } from '../src/scan/concern-v1/retrieval';
import {
  concernAdjudicationOutput,
  concernMechanismMappingOutput,
  concernVerificationOutput,
} from '../src/scan/concern-v1/schemas';
import { finalizeConcernSubject } from '../src/scan/concern-v1/scoring';
import type { StructuredAnalysisV2, UserProfile } from '../src/scan/engine/domain';

function responseWithOutput(output: unknown, id: string) {
  return new Response(JSON.stringify({
    id,
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }), { status: 200 });
}

const gerd: ConcernConditionContext = {
  key: 'gerd',
  label: 'GERD / Acid reflux',
  profileValue: 'GERD / Acid reflux',
  symptomContext: ['Heartburn'],
};

const tomatoSubject: ConcernSubject = {
  id: 'scan',
  name: 'Pasta with tomato sauce',
  clarity: 'clear',
  facts: [{
    id: 'scan:visible:0',
    rawName: 'tomato sauce',
    canonicalName: 'tomato sauce',
    evidence: 'visible',
    confidence: 'high',
    amount: 'standard',
    role: 'condiment',
    prominence: 'primary',
  }],
  prepStyle: ['boiled'],
  notes: [],
};

const tomatoMap: ConcernMechanismMap = {
  subjectId: 'scan',
  exposures: [{
    mechanismKey: 'acidic_food',
    sourceFactIds: ['scan:visible:0'],
    sourceLabel: 'tomato sauce',
    amount: 'standard',
    confidence: 'high',
    basis: 'Tomato sauce coats the pasta.',
  }],
  unresolvedFacts: [],
};

function tomatoClaim(): ConcernEvidenceClaim {
  return loadConcernEvidenceCatalog().claims.find((claim) => claim.id === 'claim_gerd_acidic_food')!;
}

function tomatoDecision(overrides: Partial<ConcernSubjectDecision['conditions'][number]> = {}): ConcernSubjectDecision {
  return {
    subjectId: 'scan',
    conditions: [{
      conditionKey: 'gerd',
      genericBand: 'moderate',
      personalizedBand: 'moderate',
      position: 'middle',
      confidence: 'high',
      mechanismKeys: ['acidic_food'],
      sourceFactIds: ['scan:visible:0'],
      claimIds: ['claim_gerd_acidic_food'],
      personalEvidenceIds: [],
      rationale: 'A normal serving of tomato sauce is a supported acidic exposure.',
      action: 'Choose less sauce or request it on the side.',
      ...overrides,
    }],
  };
}

function acceptedVerification(overrides: Partial<ConcernSubjectVerification['conditions'][number]> = {}): ConcernSubjectVerification {
  return {
    subjectId: 'scan',
    conditions: [{
      conditionKey: 'gerd',
      status: 'accepted',
      verifiedBand: 'moderate',
      verifiedPosition: 'middle',
      confidence: 'high',
      validMechanismKeys: ['acidic_food'],
      validSourceFactIds: ['scan:visible:0'],
      validClaimIds: ['claim_gerd_acidic_food'],
      validPersonalEvidenceIds: [],
      reason: 'The claim, fact, mechanism, and dose align.',
      action: 'Choose less sauce or request it on the side.',
      ...overrides,
    }],
  };
}

function mealExtraction(): StructuredAnalysisV2 {
  return {
    dishName: tomatoSubject.name,
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: [{
      rawName: 'tomato sauce',
      canonicalName: 'tomato sauce',
      confidence: 'high',
      evidence: 'visible',
      amountEstimate: 'standard',
      role: 'condiment',
      prominence: 'primary',
    }],
    inferredIngredients: [],
    prepStyle: ['boiled'],
    notes: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
}

function profile(conditions: string[], symptoms: string[] = []): UserProfile {
  return {
    userId: 'user-1',
    knownConditions: conditions,
    knownIngredientSensitivities: [],
    commonSymptoms: symptoms,
    mealContexts: [],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
    dietPreferences: [],
    stomachProfile: {
      version: 1,
      conditions: [],
      declaredIngredientSensitivities: [],
      ingredientScores: {},
      conditionSensitivityWeights: {},
      freeformCustomNotes: [],
      metadata: {
        profileConfidenceLevel: 'early',
        reportCount: 0,
        learnedIngredientCount: 0,
        topTriggers: [],
        topSafeFoods: [],
        declaredSensitivities: [],
      },
    },
  };
}

describe('concern_v1 evidence and profile resolution', () => {
  it('loads a versioned catalog with authoritative URLs and unique claim ids', () => {
    const catalog = loadConcernEvidenceCatalog();
    expect(catalog.version).toMatch(/^concern_evidence_/);
    expect(catalog.claims.length).toBeGreaterThanOrEqual(18);
    expect(new Set(catalog.claims.map((claim) => claim.id)).size).toBe(catalog.claims.length);
    expect(catalog.claims.every((claim) => claim.source.url.startsWith('https://'))).toBe(true);
  });

  it('uses named conditions and treats general discomfort only as symptom context', () => {
    expect(resolveConcernConditions(profile(
      ['GERD / Acid reflux', 'Unsure, just general discomfort'],
      ['Heartburn', 'Bloating'],
    ))).toEqual([{ ...gerd, symptomContext: ['Heartburn', 'Bloating'] }]);
    expect(resolveConcernConditions(profile(
      ['Unsure, just general discomfort'],
      ['Bloating'],
    ))).toEqual([{
      key: 'general_discomfort',
      label: 'General gut sensitivity',
      profileValue: 'Unsure, just general discomfort',
      symptomContext: ['Bloating'],
    }]);
  });

  it('recognizes supported acronyms inside qualified condition names', () => {
    expect(resolveConcernConditions(profile(['IBS-D', 'GERD / reflux']))).toEqual([
      {
        key: 'ibs',
        label: 'IBS',
        profileValue: 'IBS-D',
        symptomContext: [],
      },
      {
        key: 'gerd',
        label: 'GERD / Acid reflux',
        profileValue: 'GERD / reflux',
        symptomContext: [],
      },
    ]);
  });

  it('retrieves only condition-scoped claims and deduplicates identical evidence', () => {
    const claim = tomatoClaim();
    const duplicate = { ...claim, id: 'claim_duplicate_source' };
    const retrieved = retrieveConcernEvidence({
      claims: [claim, duplicate, loadConcernEvidenceCatalog().claims.find((entry) => entry.id === 'claim_lactose_direct_exposure')!],
      conditions: [gerd],
      mechanismMaps: [tomatoMap],
    });
    expect(retrieved.map((entry) => entry.id)).toEqual(['claim_gerd_acidic_food']);
  });
});

describe('concern_v1 structured output validation', () => {
  it('accepts a representative mechanism map and rejects missing, extra, invalid, and unknown source fields', () => {
    const output = concernMechanismMappingOutput([tomatoSubject]);
    expect(output.parse(JSON.stringify({ subjects: [tomatoMap] }))).toEqual({ subjects: [tomatoMap] });
    expect(() => output.parse(JSON.stringify({ subjects: [] }))).toThrow();
    expect(() => output.parse(JSON.stringify({ subjects: [{ ...tomatoMap, extra: true }] }))).toThrow();
    expect(() => output.parse(JSON.stringify({ subjects: [{ ...tomatoMap, exposures: [{ ...tomatoMap.exposures[0], mechanismKey: 'not_real' }] }] }))).toThrow();
    expect(() => output.parse(JSON.stringify({ subjects: [{ ...tomatoMap, exposures: [{ ...tomatoMap.exposures[0], sourceFactIds: ['unknown'] }] }] }))).toThrow();
  });

  it('requires evidence for a scoring-critical band and exact subject and condition shapes', () => {
    const output = concernAdjudicationOutput({
      subjects: [tomatoSubject],
      conditions: [gerd],
      mechanismMaps: [tomatoMap],
      claims: [tomatoClaim()],
      personalEvidence: [],
    });
    const valid = tomatoDecision();
    expect(output.parse(JSON.stringify({ subjects: [valid] }))).toEqual({ subjects: [valid] });
    expect(() => output.parse(JSON.stringify({ subjects: [tomatoDecision({ claimIds: [] })] }))).toThrow();
    expect(() => output.parse(JSON.stringify({ subjects: [tomatoDecision({ conditionKey: 'ibs' })] }))).toThrow();
    expect(() => output.parse(JSON.stringify({ subjects: [{ ...valid, conditions: [{ ...valid.conditions[0], extra: true }] }] }))).toThrow();
  });

  it('prevents the independent verifier from raising a proposed decision', () => {
    const decision = tomatoDecision({ personalizedBand: 'mild', genericBand: 'mild', position: 'middle' });
    const output = concernVerificationOutput({ decisions: [decision], claims: [tomatoClaim()] });
    const accepted = acceptedVerification({ verifiedBand: 'mild', verifiedPosition: 'middle' });
    expect(output.parse(JSON.stringify({ subjects: [accepted] }))).toEqual({ subjects: [accepted] });
    expect(() => output.parse(JSON.stringify({
      subjects: [acceptedVerification({ verifiedBand: 'moderate', verifiedPosition: 'lower' })],
    }))).toThrow();
    expect(() => output.parse(JSON.stringify({
      subjects: [acceptedVerification({ status: 'uncertain', verifiedBand: 'mild', verifiedPosition: 'lower', confidence: 'medium' })],
    }))).toThrow();
  });
});

describe('concern_v1 score finalization and transformations', () => {
  it('uses the highest supported condition for the headline without summing conditions', () => {
    const ibs: ConcernConditionContext = { key: 'ibs', label: 'IBS', profileValue: 'IBS', symptomContext: [] };
    const result = finalizeConcernSubject({
      subject: tomatoSubject,
      conditionContexts: [gerd, ibs],
      decisions: [
        tomatoDecision().conditions[0],
        { ...tomatoDecision().conditions[0], conditionKey: 'ibs', genericBand: 'mild', personalizedBand: 'mild', claimIds: ['claim_ibs_low_fodmap'] },
      ],
      verification: {
        subjectId: 'scan',
        conditions: [
          acceptedVerification().conditions[0],
          { ...acceptedVerification().conditions[0], conditionKey: 'ibs', verifiedBand: 'mild', validClaimIds: ['claim_ibs_low_fodmap'] },
        ],
      },
    });
    expect(result.score).toBe(50);
    expect(result.drivingConditionKey).toBe('gerd');
  });

  it('turns a tomato-removal transformation into a lower GERD score while leaving the scale stable', () => {
    const withTomato = finalizeConcernSubject({
      subject: tomatoSubject,
      conditionContexts: [gerd],
      decisions: tomatoDecision().conditions,
      verification: acceptedVerification(),
    });
    const withoutTomatoSubject = { ...tomatoSubject, name: 'Plain pasta', facts: [] };
    const withoutDecision = tomatoDecision({
      genericBand: 'none',
      personalizedBand: 'none',
      position: 'middle',
      confidence: 'high',
      mechanismKeys: [],
      sourceFactIds: [],
      claimIds: [],
      rationale: 'No supported GERD mechanism remains.',
      action: 'No change needed from this scan.',
    });
    const withoutTomato = finalizeConcernSubject({
      subject: withoutTomatoSubject,
      conditionContexts: [gerd],
      decisions: withoutDecision.conditions,
      verification: acceptedVerification({
        verifiedBand: 'none',
        verifiedPosition: 'middle',
        validMechanismKeys: [],
        validSourceFactIds: [],
        validClaimIds: [],
        validPersonalEvidenceIds: [],
      }),
    });
    expect(withoutTomato.score).toBeLessThan(withTomato.score);
    expect(withTomato.score - withoutTomato.score).toBeGreaterThanOrEqual(40);
  });
});

describe('concern_v1 mocked integration', () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('regenerates an invalid mechanism map and completes with raw audits and usage', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const invalidMap = { ...tomatoMap, exposures: [{ ...tomatoMap.exposures[0], sourceFactIds: ['MEAL_CONTENT_MUST_NOT_BE_LOGGED'] }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({ subjects: [invalidMap] }, 'concern-map-invalid'))
      .mockResolvedValueOnce(responseWithOutput({ subjects: [tomatoMap] }, 'concern-map-valid'))
      .mockResolvedValueOnce(responseWithOutput({ subjects: [tomatoDecision()] }, 'concern-decision'))
      .mockResolvedValueOnce(responseWithOutput({ subjects: [acceptedVerification()] }, 'concern-verification'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runConcernV1Shadow } = await import('../src/scan/concern-v1/openai');

    const run = await runConcernV1Shadow({
      extraction: mealExtraction(),
      profile: profile(['GERD / Acid reflux'], ['Heartburn']),
      insights: [],
    });

    expect(run.result).toMatchObject({
      status: 'completed',
      subjects: [{ score: 50, drivingConditionKey: 'gerd' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(run.audits).toHaveLength(3);
    expect(run.audits[0]).toMatchObject({
      stage: 'concern_v1_mechanism_mapping',
      totalTokens: 30,
      requestMetadata: { attemptCount: 2 },
      rawResponseJson: { attempts: [{ id: 'concern-map-invalid' }, { id: 'concern-map-valid' }] },
    });
    const retryRequest = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(retryRequest).not.toContain('MEAL_CONTENT_MUST_NOT_BE_LOGGED');
  });

  it('fails closed after three invalid outputs without producing a normalized score', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.resetModules();
    const invalidMap = { ...tomatoMap, exposures: [{ ...tomatoMap.exposures[0], sourceFactIds: ['invalid'] }] };
    const fetchMock = vi.fn(async () => responseWithOutput({ subjects: [invalidMap] }, 'concern-invalid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { runConcernV1Shadow } = await import('../src/scan/concern-v1/openai');

    const run = await runConcernV1Shadow({
      extraction: mealExtraction(),
      profile: profile(['GERD']),
      insights: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(run.result).toMatchObject({ status: 'failed', stage: 'mechanism_mapping' });
    expect(run.result).not.toHaveProperty('subjects');
    expect(run.audits).toHaveLength(1);
    expect(run.audits[0]).toMatchObject({ status: 'failed', parsedResponseJson: null });
  });
});

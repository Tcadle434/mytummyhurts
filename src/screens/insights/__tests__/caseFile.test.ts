import { describe, expect, it } from 'vitest';

import type { IngredientInsight, InsightSourceBreakdown } from '../../../types/domain';
import {
  buildCaseSentence,
  buildDayEvidence,
  buildEvidenceSummary,
  buildNextStep,
  memberEvidenceLine,
  type CaseScanInput,
} from '../caseFile';

function breakdown(overrides: Partial<InsightSourceBreakdown> = {}): InsightSourceBreakdown {
  return {
    declared: false,
    science: false,
    personal: false,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 0,
    ...overrides,
  };
}

function insight(overrides: Partial<IngredientInsight> = {}): IngredientInsight {
  return {
    id: `insight-${overrides.ingredientName ?? 'test'}`,
    ingredientName: 'bread',
    triggerScore: 4,
    safeScore: 15,
    combinedRiskScore: 40,
    confidenceLevel: 'low',
    patternStrength: 'weak',
    linkedConditions: [],
    supportingEvidenceCount: 1,
    positiveEvidenceCount: 1,
    negativeEvidenceCount: 0,
    sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 1, pairedDayCount: 1 }),
    lastRecomputedAt: new Date(2026, 6, 1).toISOString(),
    summary: '',
    ...overrides,
  };
}

function scan(overrides: Partial<CaseScanInput> = {}): CaseScanInput {
  return {
    id: `scan-${overrides.localDate ?? 'x'}-${overrides.dishName ?? 'meal'}`,
    dishName: 'Turkey sandwich',
    localDate: '2026-06-23',
    createdAt: '2026-06-23T12:00:00.000Z',
    possibleTriggers: [],
    structuredAnalysis: {
      visibleIngredients: [{ canonicalName: 'bread' }],
      inferredIngredients: [],
    },
    ...overrides,
  };
}

describe('buildCaseSentence', () => {
  it('tells a safe family how many calm days clear it', () => {
    const sentence = buildCaseSentence({
      kind: 'family',
      status: 'safe',
      members: [
        insight({ ingredientName: 'bread' }),
        insight({ ingredientName: 'naan' }),
      ],
    });
    expect(sentence).toBe('All 2 foods have sat calm so far — 2 more calm days each clears them.');
  });

  it('gives a single safe food its own countdown', () => {
    const sentence = buildCaseSentence({
      kind: 'ingredient',
      status: 'safe',
      members: [insight({ positiveEvidenceCount: 2 })],
    });
    expect(sentence).toBe('Calm on 2 days you ate it so far — 1 more calm day clears it.');
  });

  it('names the worst member when a group is under review', () => {
    const sentence = buildCaseSentence({
      kind: 'group',
      status: 'suspect',
      members: [
        insight({ ingredientName: 'garlic', negativeEvidenceCount: 2, combinedRiskScore: 58, sourceBreakdown: breakdown({ personal: true, negativeEvidenceCount: 2, pairedDayCount: 3 }) }),
        insight({ ingredientName: 'onion' }),
      ],
    });
    expect(sentence).toBe('Garlic drove this — rough on 2 of its 3 days. 1 more would confirm it.');
  });

  it('keeps declared seeds honest about missing evidence', () => {
    const sentence = buildCaseSentence({
      kind: 'ingredient',
      status: 'suspect',
      members: [
        insight({
          combinedRiskScore: 62,
          positiveEvidenceCount: 0,
          supportingEvidenceCount: 0,
          sourceBreakdown: breakdown({ declared: true }),
        }),
      ],
    });
    expect(sentence).toBe('You flagged this one — daily check-ins will confirm or clear it.');
  });

  it('celebrates cleared without hedging', () => {
    const sentence = buildCaseSentence({
      kind: 'ingredient',
      status: 'cleared',
      members: [insight({ positiveEvidenceCount: 3 })],
    });
    expect(sentence).toBe('Calm on every one of the 3 days you ate it — off the suspect list.');
  });

  it('explains watching by what is missing', () => {
    const sentence = buildCaseSentence({
      kind: 'ingredient',
      status: 'watching',
      members: [
        insight({
          positiveEvidenceCount: 0,
          supportingEvidenceCount: 0,
          sourceBreakdown: breakdown({ exposureDayCount: 4 }),
        }),
      ],
    });
    expect(sentence).toBe(
      "You've eaten this on 4 days, but no check-ins landed on those days yet.",
    );
  });
});

describe('buildDayEvidence', () => {
  it('groups matching scans by day and joins the check-in outcome', () => {
    const days = buildDayEvidence({
      memberNames: ['bread'],
      scans: [
        scan({ localDate: '2026-06-23', dishName: 'Turkey sandwich' }),
        scan({ localDate: '2026-06-23', dishName: 'Toast' }),
        scan({ localDate: '2026-06-25', dishName: 'Pizza' }),
        scan({ localDate: '2026-06-24', dishName: 'Salad', structuredAnalysis: { visibleIngredients: [{ canonicalName: 'lettuce' }], inferredIngredients: [] } }),
      ],
      reports: [
        { localDate: '2026-06-23', gutSeverity: 2 },
        { localDate: '2026-06-25', gutSeverity: 8 },
      ],
    });

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      localDate: '2026-06-25',
      mealTitles: ['Pizza'],
      outcome: 'rough',
    });
    expect(days[1]).toMatchObject({
      localDate: '2026-06-23',
      mealTitles: ['Turkey sandwich', 'Toast'],
      outcome: 'calm',
    });
  });

  it('keeps days without a check-in visible as none', () => {
    const days = buildDayEvidence({
      memberNames: ['bread'],
      scans: [scan({ localDate: '2026-06-26' })],
      reports: [],
    });
    expect(days[0]!.outcome).toBe('none');
  });

  it('skips non-food scans and respects the limit', () => {
    const days = buildDayEvidence({
      memberNames: ['bread'],
      scans: [
        scan({ localDate: '2026-06-20', scanCategory: 'menu' }),
        ...Array.from({ length: 9 }, (_, index) =>
          scan({ localDate: `2026-06-0${index + 1}`.slice(0, 10) }),
        ),
      ],
      reports: [],
      limit: 3,
    });
    expect(days).toHaveLength(3);
    expect(days.every((day) => day.localDate !== '2026-06-20')).toBe(true);
  });
});

describe('memberEvidenceLine', () => {
  it('leads with rough when present', () => {
    expect(memberEvidenceLine(insight({ negativeEvidenceCount: 2, positiveEvidenceCount: 1 }))).toBe(
      '2 rough days · 1 calm',
    );
  });

  it('shows calm alone for safe members', () => {
    expect(memberEvidenceLine(insight({ positiveEvidenceCount: 2 }))).toBe('2 calm days');
  });

  it('falls back to exposure coverage', () => {
    expect(
      memberEvidenceLine(
        insight({
          positiveEvidenceCount: 0,
          sourceBreakdown: breakdown({ exposureDayCount: 3 }),
        }),
      ),
    ).toBe('seen on 3 days — no check-ins yet');
  });
});

describe('buildEvidenceSummary', () => {
  it('summarizes calm and rough day counts', () => {
    const summary = buildEvidenceSummary([
      { localDate: '1', dateLabel: '', mealTitles: [], outcome: 'calm' },
      { localDate: '2', dateLabel: '', mealTitles: [], outcome: 'calm' },
      { localDate: '3', dateLabel: '', mealTitles: [], outcome: 'rough' },
      { localDate: '4', dateLabel: '', mealTitles: [], outcome: 'none' },
    ]);
    expect(summary).toBe('2 calm · 1 rough');
  });

  it('falls back to day count when no outcomes landed', () => {
    const summary = buildEvidenceSummary([
      { localDate: '1', dateLabel: '', mealTitles: [], outcome: 'none' },
    ]);
    expect(summary).toBe('1 day');
  });
});

describe('buildNextStep', () => {
  it('gives every status a concrete action', () => {
    expect(buildNextStep('watching')).toContain('check-in');
    expect(buildNextStep('suspect')).toContain('check-ins');
    expect(buildNextStep('safe')).toContain('calm days');
    expect(buildNextStep('confirmed')).toContain('swap');
    expect(buildNextStep('cleared')).toContain('menu');
  });
});

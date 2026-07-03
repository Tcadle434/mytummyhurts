import { describe, expect, it } from 'vitest';

import {
  buildTriggerProfileShareText,
  buildTriggerProfileViewState,
  evidenceDetailForInsight,
  statusForInsight,
  statusForMembers,
  summarizeTriggerCounts,
} from '../triggerProfile';
import type { IngredientInsight, InsightSourceBreakdown } from '../../../types/domain';

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

function insight(overrides: Partial<IngredientInsight>): IngredientInsight {
  return {
    id: 'insight-test',
    ingredientName: 'garlic',
    triggerScore: 16,
    safeScore: 4,
    combinedRiskScore: 62,
    confidenceLevel: 'low',
    patternStrength: 'weak',
    linkedConditions: [],
    supportingEvidenceCount: 1,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 0,
    sourceBreakdown: breakdown(),
    lastRecomputedAt: new Date(2026, 5, 10).toISOString(),
    summary: '',
    ...overrides,
  };
}

describe('statusForInsight', () => {
  it('confirms high-risk insights with strong evidence', () => {
    expect(statusForInsight(insight({ combinedRiskScore: 70, confidenceLevel: 'high' }))).toBe('confirmed');
    expect(statusForInsight(insight({ combinedRiskScore: 64, negativeEvidenceCount: 3 }))).toBe('confirmed');
  });

  it('keeps a declared seed as a suspect until evidence lands', () => {
    expect(
      statusForInsight(insight({ combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) })),
    ).toBe('suspect');
  });

  it('marks any reactive co-occurrence as a suspect', () => {
    expect(statusForInsight(insight({ combinedRiskScore: 48, negativeEvidenceCount: 1 }))).toBe('suspect');
  });

  it('clears a declared trigger after two calm days', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 34,
          positiveEvidenceCount: 2,
          negativeEvidenceCount: 0,
          sourceBreakdown: breakdown({ declared: true, personal: true, positiveEvidenceCount: 2 }),
        }),
      ),
    ).toBe('cleared');
  });

  it('clears any food after three calm days with no reactions — earned exoneration', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 30,
          positiveEvidenceCount: 3,
          negativeEvidenceCount: 0,
          sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 3 }),
        }),
      ),
    ).toBe('cleared');
  });

  it('marks calm-leaning learned foods as looking safe', () => {
    expect(
      statusForInsight(insight({ combinedRiskScore: 38, positiveEvidenceCount: 2, triggerScore: 2, safeScore: 14 })),
    ).toBe('safe');
  });

  it('keeps neutral paired evidence in watching — not under review', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 50,
          supportingEvidenceCount: 1,
          sourceBreakdown: breakdown({ personal: true, pairedDayCount: 1 }),
        }),
      ),
    ).toBe('watching');
  });

  it('keeps scanned-but-unpaired foods in watching', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 50,
          supportingEvidenceCount: 0,
          sourceBreakdown: breakdown({ exposureDayCount: 4 }),
        }),
      ),
    ).toBe('watching');
  });
});

describe('statusForMembers', () => {
  // Regression: the group synthetic insight mixes max-risk from one member
  // with confidence from another; deriving status from it produced 'Confirmed
  // triggers' sections no member earned. Group verdicts come from members.
  it('never grants a verdict no member earned', () => {
    const milk = insight({ ingredientName: 'milk', combinedRiskScore: 66, confidenceLevel: 'low', negativeEvidenceCount: 1 });
    const cheese = insight({ ingredientName: 'cheese', combinedRiskScore: 55, confidenceLevel: 'high', negativeEvidenceCount: 2 });
    expect(statusForInsight(milk)).toBe('suspect');
    expect(statusForInsight(cheese)).toBe('suspect');
    expect(statusForMembers([milk, cheese])).toBe('suspect');
  });

  it('confirms the group when any member is confirmed', () => {
    const confirmed = insight({ ingredientName: 'garlic', combinedRiskScore: 70, confidenceLevel: 'high', negativeEvidenceCount: 1 });
    const suspect = insight({ ingredientName: 'onion', combinedRiskScore: 55, negativeEvidenceCount: 2 });
    expect(statusForMembers([confirmed, suspect])).toBe('confirmed');
  });

  it('clears only when every member is cleared', () => {
    const cleared = insight({ ingredientName: 'rice', combinedRiskScore: 30, positiveEvidenceCount: 3 });
    const safe = insight({ ingredientName: 'oats', combinedRiskScore: 42, positiveEvidenceCount: 1 });
    expect(statusForMembers([cleared, safe])).toBe('safe');
    expect(statusForMembers([cleared])).toBe('cleared');
  });
});

describe('summarizeTriggerCounts', () => {
  it('treats missing insights as an empty profile', () => {
    expect(summarizeTriggerCounts(undefined)).toEqual({
      confirmed: 0,
      suspects: 0,
      watching: 0,
      cleared: 0,
      safe: 0,
    });
  });

  it('buckets a mixed set of insights', () => {
    const counts = summarizeTriggerCounts([
      insight({ combinedRiskScore: 70, confidenceLevel: 'high' }),
      insight({ ingredientName: 'dairy', combinedRiskScore: 62 }),
      insight({ ingredientName: 'coffee', combinedRiskScore: 38, positiveEvidenceCount: 1 }),
      insight({ ingredientName: 'parsley', combinedRiskScore: 50 }),
    ]);

    expect(counts).toEqual({ confirmed: 1, suspects: 1, watching: 1, cleared: 0, safe: 1 });
  });
});

describe('buildTriggerProfileViewState', () => {
  const mixed = [
    insight({ ingredientName: 'garlic', combinedRiskScore: 70, confidenceLevel: 'high', negativeEvidenceCount: 4, linkedConditions: ['IBS'] }),
    insight({ ingredientName: 'dairy', combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) }),
    insight({ ingredientName: 'onion', combinedRiskScore: 56, negativeEvidenceCount: 2 }),
    insight({ ingredientName: 'rice', combinedRiskScore: 36, positiveEvidenceCount: 2 }),
  ];

  it('builds an empty state when insights are missing', () => {
    const viewState = buildTriggerProfileViewState(undefined);

    expect(viewState.totalTracked).toBe(0);
    expect(viewState.sections).toEqual([]);
    expect(viewState.counts).toEqual({ confirmed: 0, suspects: 0, watching: 0, cleared: 0, safe: 0 });
  });

  it('keeps a mechanism group in exactly one section even when members split statuses', () => {
    const viewState = buildTriggerProfileViewState(mixed);

    expect(viewState.sections.map((section) => section.status)).toEqual(['confirmed', 'suspect', 'safe']);

    // garlic (confirmed) + onion (suspect) share the fructan group; the group
    // renders once, in the section its own verdict earns.
    const confirmed = viewState.sections.find((section) => section.status === 'confirmed')!;
    expect(confirmed.entries).toHaveLength(1);
    const fructans = confirmed.entries[0]!;
    expect(fructans.kind).toBe('group');
    expect(fructans.label).toBe('Garlic & onion');
    expect(fructans.insight.negativeEvidenceCount).toBe(4);

    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    expect(suspects.entries.map((entry) => entry.label)).toEqual(['Dairy & lactose']);

    const safe = viewState.sections.find((section) => section.status === 'safe')!;
    expect(safe.entries.map((entry) => entry.label)).toEqual(['Rice & non-wheat grains']);
    expect(viewState.allSeeded).toBe(false);
  });

  it('keeps ungrouped foods with reactive evidence visible as family entries', () => {
    const viewState = buildTriggerProfileViewState([
      ...mixed,
      insight({ ingredientName: 'parsley', combinedRiskScore: 55, negativeEvidenceCount: 1 }),
    ]);

    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    const parsleyEntry = suspects.entries.find((entry) => entry.kind === 'family');
    expect(parsleyEntry).toBeDefined();
    expect(parsleyEntry!.members.map((member) => member.ingredientName)).toEqual(['parsley']);
  });

  it('promotes a family to cleared only when every member is cleared', () => {
    const viewState = buildTriggerProfileViewState([
      insight({ ingredientName: 'rice', combinedRiskScore: 30, positiveEvidenceCount: 3 }),
      insight({ ingredientName: 'oats', combinedRiskScore: 42, positiveEvidenceCount: 1 }),
    ]);

    expect(viewState.sections.map((section) => section.status)).toEqual(['safe']);

    const clearedOnly = buildTriggerProfileViewState([
      insight({ ingredientName: 'rice', combinedRiskScore: 30, positiveEvidenceCount: 3 }),
    ]);
    expect(clearedOnly.sections.map((section) => section.status)).toEqual(['cleared']);
  });

  it('routes neutral and unpaired foods into the watching families block', () => {
    const viewState = buildTriggerProfileViewState([
      insight({
        ingredientName: 'bread',
        combinedRiskScore: 50,
        supportingEvidenceCount: 1,
        sourceBreakdown: breakdown({ personal: true, pairedDayCount: 1 }),
      }),
      insight({
        ingredientName: 'salt',
        combinedRiskScore: 50,
        supportingEvidenceCount: 0,
        sourceBreakdown: breakdown({ exposureDayCount: 2 }),
      }),
    ]);

    expect(viewState.sections).toEqual([]);
    expect(viewState.counts.watching).toBe(2);
    const familyKeys = viewState.trackedFamilies.map((entry) => entry.family.key);
    expect(familyKeys).toContain('wheat_grains');
    // salt used to be invisible everywhere; now it lands in 'Other foods'.
    expect(familyKeys).toContain('unknown_unclassified');
  });

  // Regression: the live prod shape — one calm day credited 38 ingredients at
  // combined risk 40-46 with one calm-day each. Under the old thresholds the
  // 46-risk rows returned null status and vanished from the screen.
  it('keeps one-calm-day foods visible as looking safe (prod dead-zone regression)', () => {
    const viewState = buildTriggerProfileViewState([
      insight({
        ingredientName: 'pepperoni',
        triggerScore: 5,
        safeScore: 10,
        combinedRiskScore: 46,
        positiveEvidenceCount: 1,
        sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 1, pairedDayCount: 1, exposureDayCount: 1 }),
      }),
      insight({
        ingredientName: 'lettuce',
        triggerScore: 4,
        safeScore: 15,
        combinedRiskScore: 40,
        positiveEvidenceCount: 1,
        sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 1, pairedDayCount: 2, exposureDayCount: 2 }),
      }),
    ]);

    expect(viewState.counts).toEqual({ confirmed: 0, suspects: 0, watching: 0, cleared: 0, safe: 2 });
    expect(viewState.sections.map((section) => section.status)).toEqual(['safe']);
    const labels = viewState.sections[0]!.entries.map((entry) => entry.label);
    expect(labels).toContain('Processed & cured meats');
    expect(labels).toContain('Gentle vegetables & seaweed');
  });

  it('filters by search and condition', () => {
    expect(buildTriggerProfileViewState(mixed, { search: 'gar' }).totalTracked).toBe(1);
    expect(buildTriggerProfileViewState(mixed, { condition: 'ibs' }).totalTracked).toBe(1);
  });

  it('flags an all-seeded profile only when every insight is declared', () => {
    const seeded = buildTriggerProfileViewState([
      insight({ ingredientName: 'dairy', combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) }),
      insight({ ingredientName: 'coffee', combinedRiskScore: 38, sourceBreakdown: breakdown({ declared: true }) }),
    ]);
    expect(seeded.allSeeded).toBe(true);

    const exposureOnly = buildTriggerProfileViewState([
      insight({ ingredientName: 'salt', combinedRiskScore: 50, sourceBreakdown: breakdown({ exposureDayCount: 2 }) }),
    ]);
    expect(exposureOnly.allSeeded).toBe(false);
  });
});

describe('evidenceDetailForInsight', () => {
  it('describes suspect progress toward confirmation in days', () => {
    expect(
      evidenceDetailForInsight(
        insight({
          negativeEvidenceCount: 2,
          combinedRiskScore: 56,
          sourceBreakdown: breakdown({ negativeEvidenceCount: 2, pairedDayCount: 3 }),
        }),
        'suspect',
      ),
    ).toBe('Rough on 2 of 3 paired days — 1 more would confirm');
  });

  it('describes declared seeds with no outcomes', () => {
    expect(
      evidenceDetailForInsight(
        insight({ combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) }),
        'suspect',
      ),
    ).toBe('From your answers — daily check-ins confirm or clear it');
  });

  it('shows the path from looking safe to cleared', () => {
    expect(
      evidenceDetailForInsight(
        insight({
          combinedRiskScore: 40,
          positiveEvidenceCount: 1,
          sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 1, pairedDayCount: 1 }),
        }),
        'safe',
      ),
    ).toBe('Calm on 1 of 1 paired day — 2 more calm days to cleared');
  });

  it('celebrates cleared foods', () => {
    expect(
      evidenceDetailForInsight(
        insight({
          combinedRiskScore: 30,
          positiveEvidenceCount: 3,
          sourceBreakdown: breakdown({ personal: true, positiveEvidenceCount: 3, pairedDayCount: 3 }),
        }),
        'cleared',
      ),
    ).toBe('Calm on 3 days you ate this — no reactions');
  });

  it('describes watching foods by what is missing', () => {
    expect(
      evidenceDetailForInsight(
        insight({
          combinedRiskScore: 50,
          supportingEvidenceCount: 1,
          sourceBreakdown: breakdown({ personal: true, pairedDayCount: 1 }),
        }),
        'watching',
      ),
    ).toBe('1 paired day logged — no clear pattern yet');

    expect(
      evidenceDetailForInsight(
        insight({
          combinedRiskScore: 50,
          supportingEvidenceCount: 0,
          sourceBreakdown: breakdown({ exposureDayCount: 3 }),
        }),
        'watching',
      ),
    ).toBe('Seen in scans on 3 days — no check-ins paired yet');
  });
});

describe('condition lens sorting', () => {
  // Two seeded suspects with identical evidence (zero rough days): the one
  // whose mechanism matches the user's declared condition leads.
  const seededSuspects = [
    insight({ ingredientName: 'garlic', combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) }),
    insight({ ingredientName: 'tomato', combinedRiskScore: 62, sourceBreakdown: breakdown({ declared: true }) }),
  ];

  it('leads with the reflux pattern for a reflux user', () => {
    const viewState = buildTriggerProfileViewState(seededSuspects, {}, {
      knownConditions: ['GERD / Acid reflux'],
    });
    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    expect(suspects.entries[0]!.label).toBe('Acidic & pickled foods');
  });

  it('leads with the fructan pattern for an IBS user', () => {
    const viewState = buildTriggerProfileViewState(seededSuspects, {}, {
      knownConditions: ['IBS'],
    });
    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    expect(suspects.entries[0]!.label).toBe('Garlic & onion');
  });

  it('never lets the lens outrank real evidence', () => {
    const viewState = buildTriggerProfileViewState(
      [
        ...seededSuspects,
        insight({
          ingredientName: 'coffee',
          combinedRiskScore: 55,
          negativeEvidenceCount: 2,
          sourceBreakdown: breakdown({ personal: true, negativeEvidenceCount: 2, pairedDayCount: 3 }),
        }),
      ],
      {},
      { knownConditions: ['IBS'] },
    );
    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    // Coffee has actual rough-day evidence; it leads regardless of lens order.
    expect(suspects.entries[0]!.label).toBe('Caffeine');
  });
});

describe('buildTriggerProfileShareText', () => {
  it('lists section names with up to five entries each', () => {
    const text = buildTriggerProfileShareText(
      buildTriggerProfileViewState([
        insight({ ingredientName: 'garlic', combinedRiskScore: 70, confidenceLevel: 'high', negativeEvidenceCount: 4 }),
        insight({ ingredientName: 'rice', combinedRiskScore: 36, positiveEvidenceCount: 2 }),
      ]),
    );

    expect(text).toContain('My Trigger Profile — MyTummyHurts');
    expect(text).toContain('Confirmed triggers: Garlic & onion');
    expect(text).toContain('Looking safe: Rice & non-wheat grains');
  });
});

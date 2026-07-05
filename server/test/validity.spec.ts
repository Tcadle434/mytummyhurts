import { describe, expect, it } from 'vitest';

import { jobRequestsValidityRecompute } from '../src/learning/learning.worker';
import {
  computeValidityStats,
  validityStatsFromRow,
  type ValidityReport,
  type ValidityScan,
} from '../src/learning/validity';
import { buildProfileFromRow } from '../src/user-context/profile-mapper';

const REFERENCE = '2026-07-03';

function scan(id: string, localDate: string, overallRiskScore: number): ValidityScan {
  return { id, localDate, overallRiskScore };
}

function report(localDate: string, gutSeverity: number): ValidityReport {
  return { localDate, gutSeverity };
}

// The hand-computed fixture (see docs/predictive-validity.md for definitions):
//   s1 2026-07-01 score 80 (high) → report 07-02 sev 8  → rough  hit,  (0.80-1)^2 = 0.04
//   s2 2026-06-28 score 90 (high) → sev 2 + next-day 5  → max 5 neutral (pairs only)
//   s3 2026-06-20 score 12 (low)  → same-day sev 1      → calm   hit,  (0.12-0)^2 = 0.0144
//   s4 2026-06-10 score 20 (low)  → next-day sev 9      → rough  miss, (0.20-1)^2 = 0.64
//   s5 2026-05-15 score 70 (high) → same-day sev 8      → rough  hit (90d window only)
//   s6 2026-07-02 score 50 (mid)  → same-day sev 8      → rough — no hit rate, (0.50-1)^2 = 0.25
//   s7 2026-06-25 score 75 (high) → no report in window → unpaired, excluded everywhere
const SCANS = [
  scan('s1', '2026-07-01', 80),
  scan('s2', '2026-06-28', 90),
  scan('s3', '2026-06-20', 12),
  scan('s4', '2026-06-10', 20),
  scan('s5', '2026-05-15', 70),
  scan('s6', '2026-07-02', 50),
  scan('s7', '2026-06-25', 75),
];

const REPORTS = [
  report('2026-07-02', 8),
  report('2026-06-28', 2),
  report('2026-06-29', 5),
  report('2026-06-20', 1),
  report('2026-06-11', 9),
  report('2026-05-15', 8),
];

describe('computeValidityStats (the scorer scored by reality)', () => {
  it('computes the hand-worked fixture for both trailing windows', () => {
    const [thirty, ninety] = computeValidityStats({
      scans: SCANS,
      reports: REPORTS,
      referenceLocalDate: REFERENCE,
    });

    // 30-day window (2026-06-04..2026-07-03): pairs s1, s2, s3, s4, s6.
    expect(thirty).toEqual({
      windowDays: 30,
      nPairs: 5,
      highHitRate: 1, // s1 rough / s1 decisive-high (s2 is neutral)
      safeHitRate: 0.5, // s3 calm of {s3, s4}
      calibrationScore: 0.2361, // mean(0.04, 0.0144, 0.64, 0.25)
    });

    // 90-day window adds s5 (another decisive high hit, (0.7-1)^2 = 0.09).
    expect(ninety).toEqual({
      windowDays: 90,
      nPairs: 6,
      highHitRate: 1,
      safeHitRate: 0.5,
      calibrationScore: 0.2069, // mean(0.04, 0.0144, 0.64, 0.25, 0.09)
    });
  });

  it('uses the worst check-in of the scan day + next day as the outcome', () => {
    const [thirty] = computeValidityStats({
      scans: [scan('s1', '2026-07-01', 80)],
      reports: [report('2026-07-01', 1), report('2026-07-02', 9)],
      referenceLocalDate: REFERENCE,
    });

    // Calm same day but rough the next: the high call still counts as a hit.
    expect(thirty.highHitRate).toBe(1);
    expect(thirty.nPairs).toBe(1);
  });

  it('classifies bands on the shared edges: high >= 64, low <= 36', () => {
    const [thirty] = computeValidityStats({
      scans: [
        scan('edge-high', '2026-07-01', 64), // high band → rough outcome = hit
        scan('edge-mid-top', '2026-07-01', 63), // moderate → no hit rate
        scan('edge-low', '2026-07-01', 36), // low band → rough outcome = miss
        scan('edge-mid-bottom', '2026-07-01', 37), // moderate → no hit rate
      ],
      reports: [report('2026-07-01', 9)],
      referenceLocalDate: REFERENCE,
    });

    expect(thirty.nPairs).toBe(4);
    expect(thirty.highHitRate).toBe(1); // only the 64 counts as high
    expect(thirty.safeHitRate).toBe(0); // only the 36 counts as low, and it missed
  });

  it('classifies outcomes on the learning-engine edges: rough >= 7, calm <= 3', () => {
    const [thirty] = computeValidityStats({
      scans: [scan('a', '2026-06-20', 80), scan('b', '2026-06-25', 80), scan('c', '2026-07-01', 80)],
      reports: [report('2026-06-20', 7), report('2026-06-25', 6), report('2026-07-01', 3)],
      referenceLocalDate: REFERENCE,
    });

    // 7 = rough hit; 6 = neutral (sits out); 3 = calm miss for a high call.
    expect(thirty.nPairs).toBe(3);
    expect(thirty.highHitRate).toBe(0.5);
  });

  it('ignores scans dated after the reference day', () => {
    const [thirty] = computeValidityStats({
      scans: [scan('future', '2026-07-04', 80)],
      reports: [report('2026-07-04', 9)],
      referenceLocalDate: REFERENCE,
    });

    expect(thirty.nPairs).toBe(0);
  });

  it('returns zero pairs and null rates when reality has not weighed in', () => {
    const [thirty, ninety] = computeValidityStats({
      scans: [scan('s1', '2026-07-01', 80)],
      reports: [],
      referenceLocalDate: REFERENCE,
    });

    for (const stats of [thirty, ninety]) {
      expect(stats.nPairs).toBe(0);
      expect(stats.highHitRate).toBeNull();
      expect(stats.safeHitRate).toBeNull();
      expect(stats.calibrationScore).toBeNull();
    }
  });

  it('keeps neutral-only pairs out of every rate but inside n_pairs', () => {
    const [thirty] = computeValidityStats({
      scans: [scan('s1', '2026-07-01', 80), scan('s2', '2026-07-02', 12)],
      reports: [report('2026-07-01', 5), report('2026-07-02', 4)],
      referenceLocalDate: REFERENCE,
    });

    expect(thirty.nPairs).toBe(2);
    expect(thirty.highHitRate).toBeNull();
    expect(thirty.safeHitRate).toBeNull();
    expect(thirty.calibrationScore).toBeNull();
  });
});

describe('validityStatsFromRow (numeric-as-string row mapping)', () => {
  it('coerces postgres string numerics and preserves nulls', () => {
    const computedAt = new Date('2026-07-03T04:00:00Z');

    expect(
      validityStatsFromRow({
        window_days: 30,
        n_pairs: 5,
        high_hit_rate: '1',
        safe_hit_rate: '0.5',
        calibration_score: '0.2361',
        computed_at: computedAt,
      }),
    ).toEqual({
      windowDays: 30,
      nPairs: 5,
      highHitRate: 1,
      safeHitRate: 0.5,
      calibrationScore: 0.2361,
      computedAt: '2026-07-03T04:00:00.000Z',
    });

    expect(
      validityStatsFromRow({
        window_days: '90',
        n_pairs: '0',
        high_hit_rate: null,
        safe_hit_rate: null,
        calibration_score: null,
        computed_at: '2026-07-03T04:00:00.000Z',
      }),
    ).toEqual({
      windowDays: 90,
      nPairs: 0,
      highHitRate: null,
      safeHitRate: null,
      calibrationScore: null,
      computedAt: '2026-07-03T04:00:00.000Z',
    });
  });
});

describe('jobRequestsValidityRecompute (coalescing-queue dispatch)', () => {
  it('fires on the validity_recompute job type', () => {
    expect(jobRequestsValidityRecompute({ event_type: 'validity_recompute' })).toBe(true);
  });

  it('fires on the metadata flag even when a later event overwrote the type', () => {
    expect(
      jobRequestsValidityRecompute({
        event_type: 'scan_analyzed',
        metadata: { validityRecompute: true },
      }),
    ).toBe(true);
  });

  it('stays quiet for plain learning jobs', () => {
    expect(jobRequestsValidityRecompute({ event_type: 'daily_report_submitted' })).toBe(false);
    expect(jobRequestsValidityRecompute({ event_type: 'scan_analyzed', metadata: {} })).toBe(false);
    expect(jobRequestsValidityRecompute({ event_type: null, metadata: null })).toBe(false);
  });
});

describe('insights payload exposure (additive metadata)', () => {
  const profileRow = { known_conditions: ['IBS'], known_ingredient_sensitivities: [] };

  it('carries predictive validity into stomachProfile.metadata', () => {
    const stats = {
      windowDays: 30,
      nPairs: 5,
      highHitRate: 1,
      safeHitRate: 0.5,
      calibrationScore: 0.2361,
      computedAt: '2026-07-03T04:00:00.000Z',
    };

    const profile = buildProfileFromRow('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', profileRow, {
      predictiveValidity: stats,
    });

    expect(profile?.stomachProfile.metadata.predictiveValidity).toEqual(stats);
  });

  it('leaves the field absent until the first recompute lands', () => {
    const profile = buildProfileFromRow('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', profileRow, {});

    expect(profile?.stomachProfile.metadata.predictiveValidity).toBeUndefined();
  });
});

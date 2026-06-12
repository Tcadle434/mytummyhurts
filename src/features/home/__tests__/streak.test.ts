import { describe, expect, it } from 'vitest';

import { computeEngagementStreak } from '../streak';

function isoAt(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

const NOW = new Date(2026, 5, 10, 15, 0, 0); // June 10

describe('computeEngagementStreak', () => {
  it('returns 0 with no activity', () => {
    expect(computeEngagementStreak({ scans: [], reports: [], now: NOW })).toBe(0);
  });

  it('counts consecutive days of scans or reports', () => {
    const streak = computeEngagementStreak({
      scans: [{ createdAt: isoAt(2026, 6, 10) }, { createdAt: isoAt(2026, 6, 9) }],
      reports: [{ localDate: '2026-06-08' }],
      now: NOW,
    });
    expect(streak).toBe(3);
  });

  it("does not break when today has no activity yet", () => {
    const streak = computeEngagementStreak({
      scans: [{ createdAt: isoAt(2026, 6, 9) }],
      reports: [{ localDate: '2026-06-08' }],
      now: NOW,
    });
    expect(streak).toBe(2);
  });

  it('bridges a single missed day', () => {
    const streak = computeEngagementStreak({
      scans: [{ createdAt: isoAt(2026, 6, 10) }],
      reports: [{ localDate: '2026-06-08' }, { localDate: '2026-06-07' }],
      now: NOW,
    });
    expect(streak).toBe(3);
  });

  it('breaks on a two-day gap', () => {
    const streak = computeEngagementStreak({
      scans: [{ createdAt: isoAt(2026, 6, 10) }],
      reports: [{ localDate: '2026-06-07' }],
      now: NOW,
    });
    expect(streak).toBe(1);
  });
});

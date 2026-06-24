import { describe, expect, it } from 'vitest';

import { buildLearningProgressFromRows } from '../src/user-context/profile-mapper';

describe('profile learning progress metadata', () => {
  it('counts all paired scans on a paired report day', () => {
    const progress = buildLearningProgressFromRows(
      [
        {
          id: 'scan-1',
          scan_category: 'food',
          consumption_status: 'consumed',
          local_date: '2026-06-23',
          created_at: '2026-06-23T12:00:00.000Z',
        },
        {
          id: 'scan-2',
          scan_category: 'food',
          consumption_status: 'consumed',
          local_date: '2026-06-23',
          created_at: '2026-06-23T13:00:00.000Z',
        },
      ],
      [
        { id: 'report-1', local_date: '2026-06-22', created_at: '2026-06-22T20:00:00.000Z' },
        { id: 'report-2', local_date: '2026-06-23', created_at: '2026-06-23T20:00:00.000Z' },
      ],
    );

    expect(progress.pairedReportDays).toBe(1);
    expect(progress.pairedMealScans).toBe(2);
    expect(progress.confidentReportDays).toBe(14);
    expect(progress.confidentMealScans).toBe(28);
  });

  it('ignores skipped scans', () => {
    const progress = buildLearningProgressFromRows(
      [
        {
          id: 'scan-1',
          scan_category: 'food',
          consumption_status: 'skipped',
          local_date: '2026-06-23',
          created_at: '2026-06-23T12:00:00.000Z',
        },
      ],
      [{ id: 'report-1', local_date: '2026-06-23', created_at: '2026-06-23T20:00:00.000Z' }],
    );

    expect(progress.pairedReportDays).toBe(0);
    expect(progress.pairedMealScans).toBe(0);
  });
});

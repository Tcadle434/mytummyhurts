import { describe, expect, it } from 'vitest';

import { mergeDailyReportByLocalDate, normalizeLocalDateString, sortDailyReportsByDate } from '../dailyReports';
import type { DailyGutReport } from '../../types/domain';

function report(localDate: string, updatedAt = '2026-06-10T12:00:00.000Z'): DailyGutReport {
  return {
    id: `report-${localDate}`,
    userId: 'user-1',
    localDate,
    gutSeverity: 4,
    symptomTags: ['Bloating'],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('daily report date normalization', () => {
  it('normalizes date-only and ISO timestamp values to YYYY-MM-DD', () => {
    expect(normalizeLocalDateString('2026-06-22')).toBe('2026-06-22');
    expect(normalizeLocalDateString('2026-06-22T00:00:00.000Z')).toBe('2026-06-22');
  });

  it('drops invalid dates before sorting report state', () => {
    expect(sortDailyReportsByDate([
      report('invalid'),
      report('2026-06-22T00:00:00.000Z'),
      report('2026-06-21'),
    ])).toMatchObject([
      { localDate: '2026-06-22' },
      { localDate: '2026-06-21' },
    ]);
  });

  it('merges reports by normalized local date', () => {
    expect(mergeDailyReportByLocalDate(
      [report('2026-06-22T00:00:00.000Z', '2026-06-22T10:00:00.000Z')],
      report('2026-06-22', '2026-06-22T12:00:00.000Z'),
    )).toMatchObject([
      { localDate: '2026-06-22', updatedAt: '2026-06-22T12:00:00.000Z' },
    ]);
  });
});

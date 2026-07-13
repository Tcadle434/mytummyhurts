import { describe, expect, it } from 'vitest';

import type { DailyGutReport } from '../../../types/domain';
import {
  addMonths,
  buildCalendarCells,
  buildMonthHeadline,
  currentMonthCursor,
  isReportInMonth,
  mergeReports,
  sameCursor,
} from '../symptomLogHelpers';

function makeReport(overrides: Partial<DailyGutReport> = {}): DailyGutReport {
  return {
    id: 'report-1',
    userId: 'user-1',
    localDate: '2024-02-15',
    gutSeverity: 4,
    symptomTags: [],
    createdAt: '2024-02-15T12:00:00.000Z',
    updatedAt: '2024-02-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('symptom log helpers', () => {
  it('keeps the latest report for each date and sorts newest dates first', () => {
    const reports = mergeReports([
      makeReport({ id: 'older', updatedAt: '2024-02-15T10:00:00.000Z' }),
      makeReport({ id: 'newest-date', localDate: '2024-02-16' }),
      makeReport({ id: 'newer', updatedAt: '2024-02-15T14:00:00.000Z' }),
    ]);

    expect(reports.map((report) => report.id)).toEqual(['newest-date', 'newer']);
  });

  it('builds a padded leap-month calendar with today and future flags', () => {
    const cells = buildCalendarCells({ year: 2024, month: 1 }, new Date(2024, 1, 15, 12));

    expect(cells).toHaveLength(35);
    expect(cells.slice(0, 4).every((cell) => cell.localDate === undefined)).toBe(true);
    expect(cells.find((cell) => cell.localDate === '2024-02-15')).toMatchObject({
      day: 15,
      isToday: true,
      isFuture: false,
    });
    expect(cells.find((cell) => cell.localDate === '2024-02-16')?.isFuture).toBe(true);
    expect(cells.find((cell) => cell.localDate === '2024-02-29')?.day).toBe(29);
  });

  it('prioritizes calm days in the monthly headline', () => {
    const reports = [
      makeReport({ id: 'calm', dailyScore: 80 }),
      makeReport({ id: 'mixed-1', dailyScore: 50 }),
      makeReport({ id: 'mixed-2', dailyScore: 50 }),
    ];

    expect(buildMonthHeadline(reports, true, { year: 2024, month: 1 })).toBe('1 calm day this month');
    expect(buildMonthHeadline([], true, { year: 2024, month: 1 })).toBeNull();
  });

  it('handles month cursor navigation and report membership across years', () => {
    const december = currentMonthCursor(new Date(2024, 11, 15, 12));
    const january = addMonths(december, 1);

    expect(january).toEqual({ year: 2025, month: 0 });
    expect(sameCursor(january, { year: 2025, month: 0 })).toBe(true);
    expect(isReportInMonth('2025-01-31', january)).toBe(true);
    expect(isReportInMonth('2024-12-31', january)).toBe(false);
  });
});

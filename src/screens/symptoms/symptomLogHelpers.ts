import type { DailyGutReport } from '../../types/domain';
import {
  dailyScoreBand,
  dailyScoreValue,
  parseLocalDate,
  type DailyScoreBand,
  toLocalDate,
} from '../../utils/weeklyProgress';

export type MonthCursor = {
  year: number;
  month: number;
};

export type CalendarCell = {
  key: string;
  localDate?: string;
  day?: number;
  isToday?: boolean;
  isFuture?: boolean;
};

export function mergeReports(reports: DailyGutReport[]) {
  const byDate = new Map<string, DailyGutReport>();

  for (const report of reports) {
    const existing = byDate.get(report.localDate);
    if (!existing || new Date(report.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byDate.set(report.localDate, report);
    }
  }

  return Array.from(byDate.values()).sort((left, right) => right.localDate.localeCompare(left.localDate));
}

// The month is headlined by its best true statistic: calm first, then mixed,
// then rough.
export function buildMonthHeadline(monthReports: DailyGutReport[], isCurrentMonth: boolean, cursor: MonthCursor) {
  if (monthReports.length === 0) {
    return null;
  }

  const counts: Record<DailyScoreBand, number> = { calm: 0, mixed: 0, rough: 0 };
  for (const report of monthReports) {
    counts[dailyScoreBand(dailyScoreValue(report))] += 1;
  }

  const leadingBand: DailyScoreBand = counts.calm > 0 ? 'calm' : counts.mixed > 0 ? 'mixed' : 'rough';
  const count = counts[leadingBand];
  const dayWord = count === 1 ? 'day' : 'days';
  const period = isCurrentMonth ? 'this month' : `in ${formatMonthName(cursor)}`;
  return `${count} ${leadingBand} ${dayWord} ${period}`;
}

export function currentMonthCursor(today = new Date()): MonthCursor {
  return { year: today.getFullYear(), month: today.getMonth() };
}

export function addMonths(cursor: MonthCursor, delta: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function sameCursor(a: MonthCursor, b: MonthCursor) {
  return a.year === b.year && a.month === b.month;
}

export function isReportInMonth(localDate: string, cursor: MonthCursor) {
  const parsed = parseLocalDate(localDate);
  return parsed.getFullYear() === cursor.year && parsed.getMonth() === cursor.month;
}

export function buildCalendarCells(cursor: MonthCursor, today = new Date()): CalendarCell[] {
  const firstDay = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const todayLocalDate = toLocalDate(today);
  const cells: CalendarCell[] = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push({ key: `blank-start-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const localDate = toLocalDate(new Date(cursor.year, cursor.month, day));
    cells.push({
      key: localDate,
      localDate,
      day,
      isToday: localDate === todayLocalDate,
      isFuture: localDate > todayLocalDate,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}` });
  }

  return cells;
}

export function formatMonthTitle(cursor: MonthCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatReportDate(localDate: string) {
  return parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatShortMonth(localDate: string) {
  return parseLocalDate(localDate).toLocaleDateString(undefined, { month: 'short' });
}

export function formatDayNumber(localDate: string) {
  return String(parseLocalDate(localDate).getDate());
}

function formatMonthName(cursor: MonthCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long' });
}

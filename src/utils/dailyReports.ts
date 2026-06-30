import type { DailyGutReport } from '../types/domain';

const LOCAL_DATE_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function normalizeLocalDateString(value: unknown): string | null {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
  const match = raw.match(LOCAL_DATE_PREFIX_RE);
  if (!match) {
    return null;
  }

  const localDate = match[0];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return localDate;
}

export function sanitizeDailyReport(report: DailyGutReport): DailyGutReport | null {
  const localDate = normalizeLocalDateString(report.localDate);
  if (!localDate) {
    return null;
  }

  return {
    ...report,
    localDate,
    symptomTags: Array.isArray(report.symptomTags) ? report.symptomTags : [],
  };
}

export function sortDailyReportsByDate(dailyReports: DailyGutReport[]) {
  const byDate = new Map<string, DailyGutReport>();

  for (const report of dailyReports) {
    const normalized = sanitizeDailyReport(report);
    if (!normalized) {
      continue;
    }

    const existing = byDate.get(normalized.localDate);
    if (!existing || reportUpdatedAt(normalized) >= reportUpdatedAt(existing)) {
      byDate.set(normalized.localDate, normalized);
    }
  }

  return [...byDate.values()].sort((left, right) => right.localDate.localeCompare(left.localDate));
}

export function mergeDailyReportByLocalDate(items: DailyGutReport[], incoming: DailyGutReport) {
  const normalizedIncoming = sanitizeDailyReport(incoming);
  if (!normalizedIncoming) {
    return sortDailyReportsByDate(items);
  }

  return sortDailyReportsByDate([
    normalizedIncoming,
    ...items.filter((item) => normalizeLocalDateString(item.localDate) !== normalizedIncoming.localDate),
  ]);
}

function reportUpdatedAt(report: DailyGutReport) {
  const time = new Date(report.updatedAt ?? report.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

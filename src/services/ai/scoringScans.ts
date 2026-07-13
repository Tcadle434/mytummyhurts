import { StructuredAnalysisV2 } from '../../types/domain';

interface DatedScan {
  localDate?: string;
  createdAt?: string;
}

export interface ScoringScan extends DatedScan {
  structuredAnalysis: StructuredAnalysisV2;
  overallRiskScore?: number;
  scanCategory?: string;
}

export function localDateFromScan(scan: DatedScan) {
  if (scan.localDate) {
    return scan.localDate;
  }

  return (scan.createdAt ?? new Date().toISOString()).slice(0, 10);
}

export function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(
    Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1),
  );
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function groupFoodScansByLocalDate<T extends ScoringScan>(scans: T[]) {
  const scansByDate = new Map<string, T[]>();
  for (const scan of scans) {
    if ((scan.scanCategory ?? 'food') !== 'food') {
      continue;
    }

    const localDate = localDateFromScan(scan);
    const current = scansByDate.get(localDate) ?? [];
    current.push(scan);
    scansByDate.set(localDate, current);
  }

  return scansByDate;
}

import { DailyGutReport, ScanForInsightRecompute } from '../domain';
import { normalizeKey, symptomToCondition } from '@mth/shared-domain';
import { flattenStructuredIngredients } from './internal';

export function ingredientsForInsightScan(scan: ScanForInsightRecompute) {
  return scan.ingredients?.length ? scan.ingredients : flattenStructuredIngredients(scan.structuredAnalysis);
}

export function localDateFromScan(scan: ScanForInsightRecompute) {
  if (scan.localDate) {
    return scan.localDate;
  }

  return (scan.createdAt ?? new Date().toISOString()).slice(0, 10);
}

export function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function reportSeverityKind(value: number) {
  if (value <= 3) return 'calm' as const;
  if (value <= 6) return 'neutral' as const;
  return 'reactive' as const;
}

function linkedConditionsForReport(report: DailyGutReport, activeConditions: string[] = []) {
  const linkedConditions = report.symptomTags.flatMap((tag) => symptomToCondition[normalizeKey(tag)] ?? []);
  if (linkedConditions.length > 0) {
    return [...new Set(linkedConditions)];
  }

  if (report.gutSeverity <= 3 && activeConditions.length > 0) {
    return activeConditions.slice(0, 4);
  }

  return activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
}

export function groupFoodScansByLocalDate(scans: ScanForInsightRecompute[]) {
  const scansByDate = new Map<string, ScanForInsightRecompute[]>();
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

function uniqueIngredientsForScans(scans: ScanForInsightRecompute[]) {
  const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

  for (const scan of scans) {
    for (const ingredient of ingredientsForInsightScan(scan)) {
      const name = normalizeKey(ingredient.name);
      if (!name) {
        continue;
      }

      ingredients.set(name, {
        name,
        lastSeenAt: scan.createdAt ?? new Date().toISOString(),
      });
    }
  }

  return ingredients;
}

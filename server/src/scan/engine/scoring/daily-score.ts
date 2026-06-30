import { DailyGutReport, ScanForInsightRecompute } from '../domain';
import { DAILY_ATTRIBUTION_WINDOWS, RISK_LEVEL_HIGH_MIN, clamp, clampNumber } from '@mth/shared-domain';
import { RISK_LEVEL_MILD_MAX, averageScore, symptomDailyScore } from './internal';
import { groupFoodScansByLocalDate, localDateMinusDays } from './scan-data';

function reportBurdenValue(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  if (severity === 0) return 0;
  if (severity <= 3) return 8 + (severity - 1) * 6;
  if (severity <= 6) return 38 + (severity - 4) * 8;
  if (severity <= 8) return 62 + (severity - 7) * 8;
  return 88 + (severity - 9) * 4;
}

function foodExposureForDailyScore(
  report: DailyGutReport,
  scans: ScanForInsightRecompute[],
) {
  const scansByDate = groupFoodScansByLocalDate(scans);
  let weightedRiskTotal = 0;
  let evidenceWeight = 0;

  for (const window of DAILY_ATTRIBUTION_WINDOWS) {
    const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
    const scansForDate = scansByDate.get(exposureDate) ?? [];
    if (!scansForDate.length) {
      continue;
    }

    const averageRisk = averageScore(
      scansForDate.map((scan) => clamp(scan.overallRiskScore ?? 50)),
      50,
    );
    weightedRiskTotal += averageRisk * window.weight;
    evidenceWeight += window.weight;
  }

  if (evidenceWeight <= 0) {
    return {
      foodExposure: 50,
      foodAdjustment: 0,
      evidenceWeight: 0,
      weightedRisk: undefined,
    };
  }

  // Days flagged as partially scanned carry half the attribution weight so
  // unobserved meals don't get blamed on whatever happened to be scanned.
  const qualityMultiplier = report.evidenceQuality === 'unscanned' ? 0.5 : 1;
  const weightedRisk = weightedRiskTotal / evidenceWeight;
  const effectiveEvidenceWeight = evidenceWeight * qualityMultiplier;
  const foodAdjustment = clampNumber(
    (50 - weightedRisk) * 0.375 * Math.min(effectiveEvidenceWeight, 1),
    -15,
    15,
  );

  return {
    foodExposure: clamp(100 - weightedRisk),
    foodAdjustment: Math.round(foodAdjustment),
    evidenceWeight: Number(effectiveEvidenceWeight.toFixed(2)),
    weightedRisk,
  };
}

export function computeDailyScoreForReport(
  report: DailyGutReport,
  scans: ScanForInsightRecompute[],
  now = new Date().toISOString(),
): DailyGutReport {
  const symptomScore = symptomDailyScore(report.gutSeverity);
  const food = foodExposureForDailyScore(report, scans);
  const dailyScore = clamp(symptomScore + food.foodAdjustment);
  const drivers: DailyGutReport['dailyScoreDrivers'] = [
    {
      id: 'symptom-severity',
      label: report.gutSeverity <= 3 ? 'Calm symptoms' : report.gutSeverity >= 7 ? 'Reactive symptoms' : 'Mixed symptoms',
      detail:
        report.gutSeverity <= 3
          ? 'Your daily report pointed to a calmer gut day.'
          : report.gutSeverity >= 7
            ? 'Your daily report pointed to a more reactive gut day.'
            : 'Your daily report landed in the middle range.',
      impact: symptomScore >= RISK_LEVEL_HIGH_MIN ? 'raises' : symptomScore <= RISK_LEVEL_MILD_MAX ? 'lowers' : 'neutral',
      weight: Math.abs(symptomScore - 50),
    },
  ];

  if (typeof food.weightedRisk === 'number') {
    drivers.push({
      id: 'food-exposure',
      label: food.weightedRisk >= RISK_LEVEL_HIGH_MIN
        ? 'Higher-risk food exposure'
        : food.weightedRisk <= RISK_LEVEL_MILD_MAX
          ? 'Gentler food exposure'
          : 'Mixed food exposure',
      detail: 'Food logged across the same-day, previous-day, and two-day windows adjusted this Daily Score.',
      impact: food.foodAdjustment > 0 ? 'raises' : food.foodAdjustment < 0 ? 'lowers' : 'neutral',
      weight: Math.abs(food.foodAdjustment),
    });
  }

  return {
    ...report,
    dailyScore,
    dailyScoreComponents: {
      symptomScore,
      foodExposure: food.foodExposure,
      foodAdjustment: food.foodAdjustment,
      evidenceWeight: food.evidenceWeight,
    },
    dailyScoreDrivers: drivers,
    dailyScoreUpdatedAt: now,
  };
}

export function recomputeDailyScores(
  reports: DailyGutReport[],
  scans: ScanForInsightRecompute[],
  now = new Date().toISOString(),
) {
  return reports.map((report) => computeDailyScoreForReport(report, scans, now));
}

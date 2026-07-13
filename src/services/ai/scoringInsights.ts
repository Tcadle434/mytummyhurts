import {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  InsightConfidenceLevel,
  InsightSourceBreakdown,
  PatternStrength,
} from '../../types/domain';
import {
  DAILY_ATTRIBUTION_WINDOWS,
  PROFILE_LEARNING_STAGE_THRESHOLDS,
  clamp,
  combinedRiskScore,
  ingredientConditionImpacts,
  normalizeKey,
  patternStrengthFromRisk,
  profileConfidenceLevel,
  symptomToCondition,
  type ProfileLearningProgress,
} from '@mth/shared-domain';
import {
  flattenStructuredIngredients,
  ingredientMatchesSensitivityLabel,
} from './scoringIngredients';
import {
  groupFoodScansByLocalDate,
  localDateFromScan,
  localDateMinusDays,
  type ScoringScan,
} from './scoringScans';

interface LearningProgressScan {
  id?: string;
  localDate?: string;
  createdAt?: string;
  completedAt?: string;
  scanCategory?: string;
  consumptionStatus?: string;
}

interface InsightScan extends ScoringScan {
  id: string;
}

interface InsightOptions {
  declaredSensitivities?: string[];
  activeConditions?: string[];
}

// Ingredients that were scanned but never paired with a daily report still get
// a "watching" row (zero outcome evidence) so the Trigger Profile reflects
// coverage. Mirrors MAX_EXPOSURE_ONLY_INSIGHTS in the server learning engine.
const MAX_EXPOSURE_ONLY_INSIGHTS = 100;

function insightConfidenceLevel(evidenceCount: number): InsightConfidenceLevel {
  if (evidenceCount >= 6) {
    return 'high';
  }

  if (evidenceCount >= 3) {
    return 'medium';
  }

  return 'low';
}

function sourceBreakdown(
  ingredientName: string,
  declaredSensitivities: string[] = [],
  positiveEvidenceCount = 0,
  negativeEvidenceCount = 0,
  hasPersonalEvidence = positiveEvidenceCount + negativeEvidenceCount > 0,
): InsightSourceBreakdown {
  return {
    declared: declaredSensitivities.some((sensitivity) =>
      ingredientMatchesSensitivityLabel(ingredientName, sensitivity),
    ),
    science: Boolean(ingredientConditionImpacts[normalizeKey(ingredientName)]),
    personal: hasPersonalEvidence,
    positiveEvidenceCount,
    negativeEvidenceCount,
  };
}

export function computeProfileLearningProgress(
  scans: LearningProgressScan[],
  dailyReports: { localDate: string }[],
): ProfileLearningProgress {
  const scansByDate = new Map<string, { id: string }[]>();

  scans.forEach((scan, index) => {
    if ((scan.scanCategory ?? 'food') !== 'food' || scan.consumptionStatus === 'skipped') {
      return;
    }

    const localDate = localDateFromScan(scan);
    const current = scansByDate.get(localDate) ?? [];
    current.push({ id: scan.id ?? `${localDate}:${index}` });
    scansByDate.set(localDate, current);
  });

  const pairedReportDates = new Set<string>();
  const pairedScanIds = new Set<string>();

  for (const report of dailyReports) {
    for (const window of DAILY_ATTRIBUTION_WINDOWS) {
      const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
      const scansForDate = scansByDate.get(exposureDate) ?? [];
      if (!scansForDate.length) {
        continue;
      }

      pairedReportDates.add(report.localDate);
      scansForDate.forEach((scan) => pairedScanIds.add(scan.id));
    }
  }

  return profileLearningProgressFromCounts(pairedReportDates.size, pairedScanIds.size);
}

export function profileLearningProgressFromCounts(
  pairedReportDays: number,
  pairedMealScans: number,
): ProfileLearningProgress {
  const stage = profileConfidenceLevel(pairedReportDays, pairedMealScans);
  const reportProgress = Math.min(
    1,
    pairedReportDays / PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedReportDays,
  );
  const mealScanProgress = Math.min(
    1,
    pairedMealScans / PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedMealScans,
  );

  return {
    stage,
    percent: Math.round(clamp((reportProgress * 0.55 + mealScanProgress * 0.45) * 100)),
    pairedReportDays,
    pairedMealScans,
    confidentReportDays: PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedReportDays,
    confidentMealScans: PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedMealScans,
  };
}

function reportSeverityKind(value: number) {
  if (value <= 3) return 'calm' as const;
  if (value <= 6) return 'neutral' as const;
  return 'reactive' as const;
}

function linkedConditionsForReport(report: DailyGutReport, activeConditions: string[] = []) {
  const direct = report.symptomTags.flatMap((tag) => symptomToCondition[normalizeKey(tag)] ?? []);
  if (direct.length > 0) {
    return [...new Set(direct)];
  }

  if (report.gutSeverity <= 3 && activeConditions.length > 0) {
    return activeConditions.slice(0, 4);
  }

  return activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
}

function uniqueIngredientsForScans(
  scans: Pick<ScoringScan, 'structuredAnalysis' | 'createdAt'>[],
) {
  const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

  for (const scan of scans) {
    for (const ingredient of flattenStructuredIngredients(scan.structuredAnalysis)) {
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

export function recomputeInsights(
  scans: InsightScan[],
  dailyReports: DailyGutReport[],
  options: InsightOptions = {},
): IngredientInsight[] {
  const scansByDate = groupFoodScansByLocalDate(scans);

  // Distinct scan dates per ingredient - the exposure denominator (mirrors the
  // server's insights-learning engine).
  const exposure = new Map<string, { days: Set<string>; lastSeenAt: string }>();
  for (const [localDate, scansForDate] of scansByDate) {
    for (const ingredient of uniqueIngredientsForScans(scansForDate).values()) {
      const key = normalizeKey(ingredient.name);
      if (!key) continue;
      const current = exposure.get(key) ?? {
        days: new Set<string>(),
        lastSeenAt: ingredient.lastSeenAt,
      };
      current.days.add(localDate);
      if (ingredient.lastSeenAt > current.lastSeenAt) current.lastSeenAt = ingredient.lastSeenAt;
      exposure.set(key, current);
    }
  }

  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      conditions: Set<string>;
      weightedEvidence: number;
      calmDays: Set<string>;
      reactiveDays: Set<string>;
      neutralDays: Set<string>;
      lastSeenAt?: string;
      lastOutcomeAt?: string;
    }
  >();

  for (const report of dailyReports) {
    const linkedConditions = linkedConditionsForReport(report, options.activeConditions);
    for (const window of DAILY_ATTRIBUTION_WINDOWS) {
      const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
      const scansForDate = scansByDate.get(exposureDate) ?? [];
      const ingredients = uniqueIngredientsForScans(scansForDate);
      if (!ingredients.size) {
        continue;
      }

      const noiseFactor = ingredients.size > 16 ? 16 / ingredients.size : 1;
      const weightedSignal = window.weight * noiseFactor;
      const severityFactor = report.gutSeverity >= 9 ? 1.2 : report.gutSeverity >= 7 ? 1 : 0.75;
      const reportKind = reportSeverityKind(report.gutSeverity);

      for (const ingredient of ingredients.values()) {
        const key = normalizeKey(ingredient.name);
        const current = aggregate.get(key) ?? {
          trigger: 6,
          safe: 6,
          conditions: new Set<string>(),
          weightedEvidence: 0,
          calmDays: new Set<string>(),
          reactiveDays: new Set<string>(),
          neutralDays: new Set<string>(),
        };

        current.weightedEvidence += weightedSignal;
        if (reportKind === 'calm') {
          current.safe += weightedSignal * 28;
          current.trigger = Math.max(0, current.trigger - weightedSignal * 8);
          current.calmDays.add(report.localDate);
        } else if (reportKind === 'reactive') {
          current.trigger += weightedSignal * 26 * severityFactor;
          current.safe = Math.max(0, current.safe - weightedSignal * 5);
          current.reactiveDays.add(report.localDate);
          linkedConditions.forEach((condition) => current.conditions.add(condition));
        } else {
          current.neutralDays.add(report.localDate);
        }

        current.lastSeenAt = ingredient.lastSeenAt;
        current.lastOutcomeAt = report.updatedAt;
        aggregate.set(key, current);
      }
    }
  }

  const now = new Date().toISOString();
  const paired = [...aggregate.entries()]
    .filter(([, current]) => current.weightedEvidence > 0)
    .map(([ingredientName, current], index) => {
      const triggerScore = clamp(current.trigger);
      const safeScore = clamp(current.safe);
      const riskScore = combinedRiskScore(triggerScore, safeScore);
      const dominatesTrigger = triggerScore >= safeScore;
      // Evidence counts are DISTINCT report days, not rounded fractional
      // weights - one calm check-in reads as exactly one calm day.
      const positiveEvidenceCount = current.calmDays.size;
      const negativeEvidenceCount = current.reactiveDays.size;
      const pairedDayCount = new Set([
        ...current.calmDays,
        ...current.reactiveDays,
        ...current.neutralDays,
      ]).size;
      const exposureDayCount = exposure.get(ingredientName)?.days.size ?? 0;

      return {
        id: `insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel: insightConfidenceLevel(current.weightedEvidence),
        patternStrength: patternStrengthFromRisk(
          riskScore,
          positiveEvidenceCount + negativeEvidenceCount,
        ),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount: pairedDayCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: {
          ...sourceBreakdown(
            ingredientName,
            options.declaredSensitivities,
            positiveEvidenceCount,
            negativeEvidenceCount,
            pairedDayCount > 0,
          ),
          neutralDayCount: current.neutralDays.size,
          pairedDayCount,
          exposureDayCount,
        },
        lastRecomputedAt: now,
        summary:
          positiveEvidenceCount + negativeEvidenceCount === 0
            ? `${ingredientName} is paired with symptom reports but has no clear calm or reactive pattern yet.`
            : dominatesTrigger
              ? `${ingredientName} showed up around ${negativeEvidenceCount} rough day${negativeEvidenceCount === 1 ? '' : 's'} out of ${pairedDayCount} paired.`
              : `${ingredientName} has been calm on ${positiveEvidenceCount} of ${pairedDayCount} paired day${pairedDayCount === 1 ? '' : 's'}.`,
      };
    });

  const pairedNames = new Set(paired.map((insight) => insight.ingredientName));
  const exposureOnly = [...exposure.entries()]
    .filter(([name]) => !pairedNames.has(name))
    .sort(
      (left, right) =>
        right[1].days.size - left[1].days.size || left[0].localeCompare(right[0]),
    )
    .slice(0, MAX_EXPOSURE_ONLY_INSIGHTS)
    .map(([ingredientName, seen], index) => ({
      id: `exposure-insight-${index}-${ingredientName}`,
      ingredientName,
      triggerScore: 6,
      safeScore: 6,
      combinedRiskScore: 50,
      confidenceLevel: 'low' as InsightConfidenceLevel,
      patternStrength: 'weak' as PatternStrength,
      linkedConditions: [] as string[],
      supportingEvidenceCount: 0,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
      lastSeenAt: seen.lastSeenAt,
      lastOutcomeAt: undefined as string | undefined,
      sourceBreakdown: {
        ...sourceBreakdown(ingredientName, options.declaredSensitivities, 0, 0, false),
        neutralDayCount: 0,
        pairedDayCount: 0,
        exposureDayCount: seen.days.size,
      },
      lastRecomputedAt: now,
      summary: `${ingredientName} appeared in your scans on ${seen.days.size} day${seen.days.size === 1 ? '' : 's'} — no check-ins paired with it yet.`,
    }));

  return [...paired, ...exposureOnly].sort(
    (a, b) =>
      b.combinedRiskScore - a.combinedRiskScore ||
      b.supportingEvidenceCount - a.supportingEvidenceCount,
  );
}

export function recomputeConditionIngredientInsights(
  scans: InsightScan[],
  dailyReports: DailyGutReport[],
  options: InsightOptions = {},
): ConditionIngredientInsight[] {
  const insights = recomputeInsights(scans, dailyReports, options);
  const conditions = options.activeConditions?.length
    ? options.activeConditions.slice(0, 3)
    : ['Sensitive stomach'];

  return insights
    .filter((insight) => insight.supportingEvidenceCount > 0)
    .flatMap((insight, insightIndex) =>
      conditions.map((conditionName, conditionIndex) => ({
        id: `condition-insight-${insightIndex}-${conditionIndex}-${insight.ingredientName}`,
        ingredientName: insight.ingredientName,
        conditionName,
        riskScore: insight.combinedRiskScore,
        triggerScore: insight.triggerScore,
        safeScore: insight.safeScore,
        confidenceLevel: insight.confidenceLevel,
        positiveEvidenceCount: insight.positiveEvidenceCount,
        negativeEvidenceCount: insight.negativeEvidenceCount,
        supportingEvidenceCount: insight.supportingEvidenceCount,
        sourceBreakdown: insight.sourceBreakdown,
        lastSeenAt: insight.lastSeenAt,
        lastOutcomeAt: insight.lastOutcomeAt,
        lastRecomputedAt: insight.lastRecomputedAt,
      })),
    )
    .sort(
      (a, b) => b.riskScore - a.riskScore || b.supportingEvidenceCount - a.supportingEvidenceCount,
    )
    .slice(0, 24);
}

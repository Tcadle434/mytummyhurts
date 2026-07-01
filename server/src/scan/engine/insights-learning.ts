// Ported verbatim from supabase/functions/_shared/profile.ts — the learned
// ingredient-insight computation from daily-report outcomes (3-window
// attribution) + condition insights. Pure functions; no DB / Deno / network.
import type {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  InsightConfidenceLevel,
  StructuredAnalysisV2,
  StructuredIngredient,
} from './domain';
// Seed insights (built in engine/scoring.ts) use the shared combinedRiskScore,
// which is clamp(50 + trigger - safe). Learned insights previously applied a
// 0.9 damping here, so seed and learned rows were compared on mismatched
// scales. Import the shared function so both live on one scale.
import { combinedRiskScore, patternStrengthFromRisk } from '@mth/shared-domain';

// Ingredients that were scanned but never paired with a daily report still get
// a "watching" row (zero outcome evidence) so the Trigger Profile reflects
// coverage. Capped so a scan-heavy user cannot flood the insight table.
const MAX_EXPOSURE_ONLY_INSIGHTS = 100;

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function insightConfidenceLevel(weightedEvidence: number): InsightConfidenceLevel {
  if (weightedEvidence >= 6) return 'high';
  if (weightedEvidence >= 2) return 'medium';
  return 'low';
}

function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function severityKind(value: number) {
  if (value <= 3) return 'calm' as const;
  if (value <= 6) return 'neutral' as const;
  return 'reactive' as const;
}

function sourceBreakdown(input: {
  ingredientName: string;
  declaredSensitivities: string[];
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  neutralDayCount: number;
  pairedDayCount: number;
  exposureDayCount: number;
}) {
  const ingredientToken = input.ingredientName.toLowerCase();
  return {
    declared: input.declaredSensitivities.some((sensitivity) => {
      const token = sensitivity.trim().toLowerCase();
      return token.length > 0 && (ingredientToken.includes(token) || token.includes(ingredientToken));
    }),
    science: false,
    personal: input.pairedDayCount > 0,
    positiveEvidenceCount: input.positiveEvidenceCount,
    negativeEvidenceCount: input.negativeEvidenceCount,
    neutralDayCount: input.neutralDayCount,
    pairedDayCount: input.pairedDayCount,
    exposureDayCount: input.exposureDayCount,
  };
}

/** Build a minimal StructuredAnalysisV2 from stored ingredient rows (so a scan
 *  read back from the DB can feed the scoring/gut-score engine). */
export function structuredAnalysisFromIngredientRows(
  title: string,
  ingredients: StructuredIngredient[],
): StructuredAnalysisV2 {
  return {
    dishName: title || 'Unknown meal',
    dishConfidence: 'medium',
    clarity: ingredients.length ? 'clear' : 'unclear',
    unclearReason: ingredients.length ? undefined : 'No ingredients were stored for this scan.',
    components: title ? [{ name: title, confidence: 'medium', prepStyle: [] }] : [],
    visibleIngredients: ingredients.map((ingredient) => ({
      rawName: ingredient.name,
      canonicalName: ingredient.name,
      confidence: ingredient.confidence,
      evidence: 'visible',
    })),
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    model: 'stored-scan-v2',
    promptVersion: 'stored-scan-v2',
    imageDetail: 'not_applicable',
  } as unknown as StructuredAnalysisV2;
}

export function buildDailyReportInsights(params: {
  scans: Array<{ id: string; localDate: string; createdAt: string; ingredients: StructuredIngredient[] }>;
  reports: DailyGutReport[];
  declaredSensitivities: string[];
  activeConditions: string[];
}): IngredientInsight[] {
  const scansByDate = new Map<string, typeof params.scans>();
  for (const scan of params.scans) {
    const current = scansByDate.get(scan.localDate) ?? [];
    current.push(scan);
    scansByDate.set(scan.localDate, current);
  }

  // Distinct scan dates per ingredient — the exposure denominator. Built from
  // every scan (not just windowed ones) so unpaired foods still surface as
  // "watching" coverage.
  const exposure = new Map<string, { days: Set<string>; lastSeenAt: string }>();
  for (const scan of params.scans) {
    for (const ingredient of scan.ingredients) {
      const name = ingredient.name.trim().toLowerCase();
      if (!name) continue;
      const current = exposure.get(name) ?? { days: new Set<string>(), lastSeenAt: scan.createdAt };
      current.days.add(scan.localDate);
      if (scan.createdAt > current.lastSeenAt) current.lastSeenAt = scan.createdAt;
      exposure.set(name, current);
    }
  }

  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      weightedEvidence: number;
      calmDays: Set<string>;
      reactiveDays: Set<string>;
      neutralDays: Set<string>;
      conditions: Set<string>;
      lastSeenAt?: string;
      lastOutcomeAt?: string;
    }
  >();
  const windows = [
    { daysPrior: 0, weight: 0.55 },
    { daysPrior: 1, weight: 0.3 },
    { daysPrior: 2, weight: 0.15 },
  ];

  for (const report of params.reports) {
    const reportKind = severityKind(report.gutSeverity);
    const linkedConditions = report.symptomTags.length
      ? report.symptomTags
      : params.activeConditions.length
        ? params.activeConditions.slice(0, 3)
        : ['Sensitive stomach'];

    for (const window of windows) {
      const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
      const scans = scansByDate.get(exposureDate) ?? [];
      const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

      for (const scan of scans) {
        for (const ingredient of scan.ingredients) {
          const name = ingredient.name.trim().toLowerCase();
          if (!name) continue;
          ingredients.set(name, { name, lastSeenAt: scan.createdAt });
        }
      }

      if (!ingredients.size) continue;

      const noiseFactor = ingredients.size > 16 ? 16 / ingredients.size : 1;
      const qualityFactor = report.evidenceQuality === 'unscanned' ? 0.5 : 1;
      const weightedSignal = window.weight * noiseFactor * qualityFactor;
      const severityFactor = report.gutSeverity >= 9 ? 1.2 : report.gutSeverity >= 7 ? 1 : 0.75;

      for (const ingredient of ingredients.values()) {
        const current = aggregate.get(ingredient.name) ?? {
          trigger: 6,
          safe: 6,
          weightedEvidence: 0,
          calmDays: new Set<string>(),
          reactiveDays: new Set<string>(),
          neutralDays: new Set<string>(),
          conditions: new Set<string>(),
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
        aggregate.set(ingredient.name, current);
      }
    }
  }

  const now = new Date().toISOString();
  const paired = [...aggregate.entries()]
    .filter(([, current]) => current.weightedEvidence > 0)
    .map(([ingredientName, current], index): IngredientInsight => {
      const triggerScore = clampScore(current.trigger);
      const safeScore = clampScore(current.safe);
      const riskScore = combinedRiskScore(triggerScore, safeScore);
      // Evidence counts are DISTINCT report days, not rounded fractional
      // weights — one calm check-in reads as exactly one calm day.
      const positiveEvidenceCount = current.calmDays.size;
      const negativeEvidenceCount = current.reactiveDays.size;
      const pairedDayCount = new Set([...current.calmDays, ...current.reactiveDays, ...current.neutralDays]).size;
      const exposureDayCount = exposure.get(ingredientName)?.days.size ?? 0;
      const dominatesTrigger = triggerScore >= safeScore;

      return {
        id: `daily-insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel: insightConfidenceLevel(current.weightedEvidence),
        patternStrength: patternStrengthFromRisk(riskScore, positiveEvidenceCount + negativeEvidenceCount),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount: pairedDayCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: sourceBreakdown({
          ingredientName,
          declaredSensitivities: params.declaredSensitivities,
          positiveEvidenceCount,
          negativeEvidenceCount,
          neutralDayCount: current.neutralDays.size,
          pairedDayCount,
          exposureDayCount,
        }),
        lastRecomputedAt: now,
        summary: positiveEvidenceCount + negativeEvidenceCount === 0
          ? `${ingredientName} is paired with symptom reports but has no clear calm or reactive pattern yet.`
          : dominatesTrigger
            ? `${ingredientName} showed up around ${negativeEvidenceCount} rough day${negativeEvidenceCount === 1 ? '' : 's'} out of ${pairedDayCount} paired.`
            : `${ingredientName} has been calm on ${positiveEvidenceCount} of ${pairedDayCount} paired day${pairedDayCount === 1 ? '' : 's'}.`,
      } as unknown as IngredientInsight;
    });

  const pairedNames = new Set(paired.map((insight) => insight.ingredientName));
  const exposureOnly = [...exposure.entries()]
    .filter(([name]) => !pairedNames.has(name))
    .sort((left, right) => right[1].days.size - left[1].days.size || left[0].localeCompare(right[0]))
    .slice(0, MAX_EXPOSURE_ONLY_INSIGHTS)
    .map(([ingredientName, seen], index): IngredientInsight => ({
      id: `exposure-insight-${index}-${ingredientName}`,
      ingredientName,
      triggerScore: 6,
      safeScore: 6,
      combinedRiskScore: 50,
      confidenceLevel: 'low',
      patternStrength: 'weak',
      linkedConditions: [],
      supportingEvidenceCount: 0,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
      lastSeenAt: seen.lastSeenAt,
      sourceBreakdown: sourceBreakdown({
        ingredientName,
        declaredSensitivities: params.declaredSensitivities,
        positiveEvidenceCount: 0,
        negativeEvidenceCount: 0,
        neutralDayCount: 0,
        pairedDayCount: 0,
        exposureDayCount: seen.days.size,
      }),
      lastRecomputedAt: now,
      summary: `${ingredientName} appeared in your scans on ${seen.days.size} day${seen.days.size === 1 ? '' : 's'} — no check-ins paired with it yet.`,
    } as unknown as IngredientInsight));

  return [...paired, ...exposureOnly]
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount);
}

export function buildDailyConditionInsights(
  insights: IngredientInsight[],
  activeConditions: string[],
): ConditionIngredientInsight[] {
  const conditions = activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
  return insights
    .filter((insight) => insight.supportingEvidenceCount > 0)
    .flatMap((insight, insightIndex) =>
      conditions.map((conditionName, conditionIndex) => ({
        id: `daily-condition-${insightIndex}-${conditionIndex}-${insight.ingredientName}`,
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
      })) as unknown as ConditionIngredientInsight[],
    )
    .slice(0, 24);
}

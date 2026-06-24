// Ported verbatim from supabase/functions/_shared/profile.ts — the learned
// ingredient-insight computation from daily-report outcomes (3-window
// attribution) + condition insights. Pure functions; no DB / Deno / network.
import type {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  InsightConfidenceLevel,
  PatternStrength,
  StructuredAnalysisV2,
  StructuredIngredient,
} from './domain';

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function insightConfidenceLevel(weightedEvidence: number): InsightConfidenceLevel {
  if (weightedEvidence >= 6) return 'high';
  if (weightedEvidence >= 2) return 'medium';
  return 'low';
}

function patternStrength(value: number): PatternStrength {
  if (value >= 70) return 'strong';
  if (value >= 46) return 'moderate';
  return 'weak';
}

function combinedRiskScore(triggerScore: number, safeScore: number) {
  return clampScore(50 + (triggerScore - safeScore) * 0.9);
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

function sourceBreakdown(
  ingredientName: string,
  declaredSensitivities: string[],
  positiveEvidenceCount: number,
  negativeEvidenceCount: number,
  hasPersonalEvidence = positiveEvidenceCount + negativeEvidenceCount > 0,
) {
  const ingredientToken = ingredientName.toLowerCase();
  return {
    declared: declaredSensitivities.some((sensitivity) => {
      const token = sensitivity.trim().toLowerCase();
      return token.length > 0 && (ingredientToken.includes(token) || token.includes(ingredientToken));
    }),
    science: false,
    personal: hasPersonalEvidence,
    positiveEvidenceCount,
    negativeEvidenceCount,
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

  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      weightedEvidence: number;
      positiveEvidence: number;
      negativeEvidence: number;
      neutralEvidence: number;
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
          positiveEvidence: 0,
          negativeEvidence: 0,
          neutralEvidence: 0,
          conditions: new Set<string>(),
        };

        current.weightedEvidence += weightedSignal;
        if (reportKind === 'calm') {
          current.safe += weightedSignal * 28;
          current.trigger = Math.max(0, current.trigger - weightedSignal * 8);
          current.positiveEvidence += weightedSignal;
        } else if (reportKind === 'reactive') {
          current.trigger += weightedSignal * 26 * severityFactor;
          current.safe = Math.max(0, current.safe - weightedSignal * 5);
          current.negativeEvidence += weightedSignal;
          linkedConditions.forEach((condition) => current.conditions.add(condition));
        } else {
          current.neutralEvidence += weightedSignal;
        }

        current.lastSeenAt = ingredient.lastSeenAt;
        current.lastOutcomeAt = report.updatedAt;
        aggregate.set(ingredient.name, current);
      }
    }
  }

  return [...aggregate.entries()]
    .filter(([, current]) => current.weightedEvidence > 0)
    .map(([ingredientName, current], index): IngredientInsight => {
      const triggerScore = clampScore(current.trigger);
      const safeScore = clampScore(current.safe);
      const riskScore = combinedRiskScore(triggerScore, safeScore);
      const positiveEvidenceCount = current.positiveEvidence > 0 ? Math.max(1, Math.round(current.positiveEvidence)) : 0;
      const negativeEvidenceCount = current.negativeEvidence > 0 ? Math.max(1, Math.round(current.negativeEvidence)) : 0;
      const supportingEvidenceCount = Math.max(1, Math.round(current.weightedEvidence));
      const dominatesTrigger = triggerScore >= safeScore;

      return {
        id: `daily-insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel: insightConfidenceLevel(current.weightedEvidence),
        patternStrength: patternStrength(dominatesTrigger ? riskScore : 100 - riskScore),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: sourceBreakdown(
          ingredientName,
          params.declaredSensitivities,
          positiveEvidenceCount,
          negativeEvidenceCount,
          current.weightedEvidence > 0,
        ),
        lastRecomputedAt: new Date().toISOString(),
        summary: positiveEvidenceCount + negativeEvidenceCount === 0
          ? `${ingredientName} is paired with symptom reports but has no clear calm or reactive pattern yet.`
          : dominatesTrigger
            ? `${ingredientName} is showing up more often around reactive gut-report days.`
            : `${ingredientName} is showing up more often around calmer gut-report days.`,
      } as unknown as IngredientInsight;
    })
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

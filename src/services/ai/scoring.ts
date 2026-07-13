import { dietPreferenceLabelFromKey } from '../../data/catalog';
import {
  ConditionIngredientInsight,
  DailyGutReport,
  ExtractedIngredient,
  GutScoreDriver,
  GutScoreEvent,
  GutScoreHistoryPoint,
  GutScorePhase,
  GutScoreState,
  InsightConfidenceLevel,
  InsightSourceBreakdown,
  IngredientInsight,
  OnboardingAnswers,
  PatternStrength,
  ScanRecord,
  StructuredAnalysisV2,
  StructuredIngredient,
  UserProfile,
} from '../../types/domain';
import {
  DAILY_ATTRIBUTION_WINDOWS,
  GUT_SCORE_ALGORITHM_VERSION,
  PROFILE_LEARNING_STAGE_THRESHOLDS,
  RISK_LEVEL_HIGH_MIN,
  RISK_LEVEL_MILD_MAX,
  baselineFrequencyPenalty,
  baselineSeverityPenalty,
  clamp,
  clampNumber,
  combinedRiskScore,
  declaredSensitivityProfiles,
  frequencyRiskIndex,
  ingredientConditionImpacts,
  hasPairedEvidence,
  normalizeKey,
  patternStrengthFromRisk,
  profileConfidenceLevel,
  roundWeight,
  triggerVerdictStatusForBreakdown,
  scoreEventTime,
  severityRiskIndex,
  strongerConfidence,
  symptomToCondition,
  withinDays,
  type ProfileLearningProgress,
  type ScoringIngredient,
} from '@mth/shared-domain';

// Re-exported so existing call sites (`import { ... } from '.../services/ai/scoring'`)
// keep working now that these live in @mth/shared-domain.
export {
  GUT_SCORE_ALGORITHM_VERSION,
  PROFILE_LEARNING_STAGE_THRESHOLDS,
  type ProfileLearningProgress,
};

type GutScoreMovementSource = 'scan' | 'daily_report' | 'profile' | 'backfill';

function extractedIngredientToScoring(entry: ExtractedIngredient): ScoringIngredient {
  return {
    name: normalizeKey(entry.canonicalName || entry.rawName),
    confidence: entry.confidence,
    evidence: entry.evidence === 'inferred' ? 'inferred' : 'visible',
  };
}

function getSensitivityProfile(label: string) {
  const normalizedLabel = normalizeKey(label);
  if (declaredSensitivityProfiles[normalizedLabel]) {
    return declaredSensitivityProfiles[normalizedLabel];
  }

  return Object.values(declaredSensitivityProfiles).find((profile) =>
    profile.aliases?.some((alias) => normalizeKey(alias) === normalizedLabel),
  );
}

function ingredientMatchesSensitivityLabel(ingredientName: string, label: string) {
  const normalizedIngredient = normalizeKey(ingredientName);
  const normalizedLabel = normalizeKey(label);

  if (
    normalizedIngredient === normalizedLabel ||
    normalizedIngredient.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedIngredient)
  ) {
    return true;
  }

  const profile = getSensitivityProfile(label);
  if (!profile) {
    return false;
  }

  return (profile.ingredientAliases ?? []).some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return (
      normalizedIngredient === normalizedAlias ||
      normalizedIngredient.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedIngredient)
    );
  });
}

function deriveConditionSensitivityWeights(
  knownConditions: string[],
  commonSymptoms: string[],
  symptomFrequency?: string,
  symptomSeverityBaseline?: string,
  priorWeights: Record<string, number> = {},
) {
  const symptomCounts = commonSymptoms.reduce<Record<string, number>>((accumulator, symptom) => {
    for (const condition of symptomToCondition[normalizeKey(symptom)] ?? []) {
      accumulator[condition] = (accumulator[condition] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  const conditionUniverse = new Set<string>([
    ...knownConditions,
    ...Object.keys(symptomCounts),
    ...Object.keys(priorWeights),
  ]);

  const baselineBoost = Math.max(0, frequencyRiskIndex(symptomFrequency) + severityRiskIndex(symptomSeverityBaseline) - 2);

  return [...conditionUniverse].reduce<Record<string, number>>((accumulator, condition) => {
    const symptomLinkedCount = symptomCounts[condition] ?? 0;
    const knownConditionBonus = knownConditions.some((entry) => normalizeKey(entry) === normalizeKey(condition)) ? 0.06 : 0;
    const priorWeight = priorWeights[condition] ?? 1;
    const derivedWeight = 1 + knownConditionBonus + symptomLinkedCount * 0.08 + baselineBoost * 0.03;
    accumulator[condition] = roundWeight(clampNumber(derivedWeight * 0.8 + priorWeight * 0.2, 0.9, 1.7));
    return accumulator;
  }, {});
}

function scoringIngredientsFromStructured(structuredAnalysis: StructuredAnalysisV2): ScoringIngredient[] {
  const aggregated = new Map<string, ScoringIngredient>();

  for (const ingredient of [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients]) {
    const next = extractedIngredientToScoring(ingredient);
    if (!next.name) {
      continue;
    }

    const current = aggregated.get(next.name);
    if (!current) {
      aggregated.set(next.name, next);
      continue;
    }

    aggregated.set(next.name, {
      name: next.name,
      confidence: strongerConfidence(current.confidence, next.confidence),
      evidence: current.evidence === 'visible' || next.evidence === 'visible' ? 'visible' : 'inferred',
    });
  }

  return [...aggregated.values()];
}

function flattenStructuredIngredients(structuredAnalysis: StructuredAnalysisV2): StructuredIngredient[] {
  return scoringIngredientsFromStructured(structuredAnalysis).map((ingredient) => ({
    name: ingredient.name,
    confidence: ingredient.confidence,
  }));
}

function toIngredientScores(insights: IngredientInsight[]) {
  return insights.reduce<Record<string, UserProfile['stomachProfile']['ingredientScores'][string]>>(
    (accumulator, insight) => {
      accumulator[normalizeKey(insight.ingredientName)] = {
        triggerScore: insight.triggerScore,
        safeScore: insight.safeScore,
        combinedRiskScore: insight.combinedRiskScore,
        confidenceLevel: insight.confidenceLevel,
        linkedConditions: insight.linkedConditions,
        evidenceCount: insight.supportingEvidenceCount,
        positiveEvidenceCount: insight.positiveEvidenceCount,
        negativeEvidenceCount: insight.negativeEvidenceCount,
        sourceBreakdown: insight.sourceBreakdown,
        lastUpdatedAt: insight.lastRecomputedAt,
        lastSeenAt: insight.lastSeenAt,
        lastOutcomeAt: insight.lastOutcomeAt,
      };
      return accumulator;
    },
    {},
  );
}

// Mirrors server/src/scan/engine/scoring/seed-insights.ts — both filter by the
// shared verdict status so exposure-only watching rows never become signals.
function topTriggerSignals(insights: IngredientInsight[]) {
  return insights
    .filter((insight) => {
      const status = triggerVerdictStatusForBreakdown(insight);
      return status === 'confirmed' || status === 'suspect';
    })
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount)
    .slice(0, 5)
    .map((insight) => ({
      ingredientName: insight.ingredientName,
      score: insight.combinedRiskScore,
      confidenceLevel: insight.confidenceLevel,
      evidenceCount: insight.supportingEvidenceCount,
    }));
}

function topSafeFoodSignals(insights: IngredientInsight[]) {
  return insights
    .filter((insight) => {
      const status = triggerVerdictStatusForBreakdown(insight);
      return status === 'safe' || status === 'cleared' || insight.combinedRiskScore <= 44;
    })
    .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount)
    .slice(0, 5)
    .map((insight) => ({
      ingredientName: insight.ingredientName,
      score: 100 - insight.combinedRiskScore,
      confidenceLevel: insight.confidenceLevel,
      evidenceCount: insight.supportingEvidenceCount,
    }));
}

function recentLearningEvent(insights: IngredientInsight[]) {
  const latest = [...insights]
    .filter((insight) => Boolean(insight.lastOutcomeAt))
    .sort((left, right) => new Date(right.lastOutcomeAt ?? 0).getTime() - new Date(left.lastOutcomeAt ?? 0).getTime())[0];

  if (!latest?.lastOutcomeAt) {
    return undefined;
  }

  const calm = latest.safeScore > latest.triggerScore;
  return {
    ingredientName: latest.ingredientName,
    outcome: calm ? ('calm' as const) : ('reactive' as const),
    gutSeverity: calm ? 2 : 6,
    submittedAt: latest.lastOutcomeAt,
  };
}

function foodsToReintroduceFromAnswers(answers: OnboardingAnswers) {
  return (answers.favoriteFoodsToReintroduce ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function baselineGutScore(answers: OnboardingAnswers) {
  const knownConditions = [...answers.conditions, ...answers.customConditions].filter(Boolean);
  const knownIngredientSensitivities = [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ].filter(Boolean);
  const symptomCount = [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])].filter(Boolean).length;
  const totalPenalty =
    baselineFrequencyPenalty(answers.symptomFrequency) +
    baselineSeverityPenalty(answers.symptomSeverityBaseline) +
    Math.min(Math.max(0, symptomCount - 1) * 3, 12) +
    Math.min(knownConditions.length * 4, 12) +
    Math.min(knownIngredientSensitivities.length * 3, 10);

  return clampNumber(Math.round(75 - totalPenalty), 10, 75);
}

function symptomDailyScore(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  return clamp(90 - severity * 8);
}

function foodExposureForDailyScore(report: DailyGutReport, scans: ScanRecord[]) {
  const scansByDate = groupFoodScansByLocalDate(scans);
  let weightedRiskTotal = 0;
  let evidenceWeight = 0;

  for (const window of DAILY_ATTRIBUTION_WINDOWS) {
    const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
    const scansForDate = scansByDate.get(exposureDate) ?? [];
    if (!scansForDate.length) {
      continue;
    }

    const averageRisk = averageScore(scansForDate.map((scan) => clamp(scan.overallRiskScore ?? 50)), 50);
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

export function computeDailyScoreForReport(report: DailyGutReport, scans: ScanRecord[], now = new Date().toISOString()): DailyGutReport {
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

export function recomputeDailyScores(reports: DailyGutReport[], scans: ScanRecord[], now = new Date().toISOString()) {
  return reports.map((report) => computeDailyScoreForReport(report, scans, now));
}

function averageScore(values: number[], fallback: number) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback;
}

function gutScoreConfidence(reportCount: number) {
  if (reportCount >= 10) return 'high' as const;
  if (reportCount >= 3) return 'medium' as const;
  return 'low' as const;
}

function gutScoreTrendDirection(delta: number) {
  if (delta <= -2) return 'down' as const;
  if (delta >= 2) return 'up' as const;
  return 'flat' as const;
}

function ingredientBaselineRisk(ingredientName: string, answers: OnboardingAnswers) {
  const normalized = normalizeKey(ingredientName);
  const scienceRisk = Object.values(ingredientConditionImpacts[normalized] ?? {}).reduce((total, value) => total + Math.max(0, value), 0);
  const declaredRisk = [...answers.ingredientSensitivities, ...answers.customIngredientSensitivities].some((sensitivity) =>
    ingredientMatchesSensitivityLabel(normalized, sensitivity),
  )
    ? 24
    : 0;

  return clamp(36 + scienceRisk + declaredRisk);
}

function recentFoodLoadComponent(
  answers: OnboardingAnswers,
  insights: IngredientInsight[],
  scans: ScanRecord[],
  nowMs: number,
) {
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const recentFoodScans = scans.filter(
    (scan) => (scan.scanCategory ?? 'food') === 'food' && withinDays(scan.completedAt ?? scan.createdAt, 7, nowMs),
  );

  if (!recentFoodScans.length) {
    const fallbackRisk = clamp(48 + Math.min([...(answers.ingredientSensitivities ?? []), ...(answers.customIngredientSensitivities ?? [])].length * 4, 22));
    return clamp(100 - fallbackRisk);
  }

  const scanScores = recentFoodScans.map((scan) => {
    const ingredientScores = flattenStructuredIngredients(scan.structuredAnalysis).map((ingredient) => {
      const insight = insightMap.get(normalizeKey(ingredient.name));
      return insight?.combinedRiskScore ?? ingredientBaselineRisk(ingredient.name, answers);
    });

    return Math.max(scan.overallRiskScore ?? 0, ...ingredientScores, 42);
  });

  return clamp(100 - averageScore(scanScores, 55));
}

function personalizedIngredientEvidenceComponent(insights: IngredientInsight[]) {
  if (!insights.length) return 42;

  const positiveEvidence = insights.reduce((total, insight) => total + insight.positiveEvidenceCount, 0);
  const negativeEvidence = insights.reduce((total, insight) => total + insight.negativeEvidenceCount, 0);
  const triggerPressure = averageScore(
    insights.filter((insight) => insight.negativeEvidenceCount > 0).map((insight) => insight.combinedRiskScore),
    50,
  );
  const safePressure = averageScore(
    insights.filter((insight) => insight.positiveEvidenceCount > 0).map((insight) => 100 - insight.combinedRiskScore),
    20,
  );

  const reactivity = clamp(55 + negativeEvidence * 5 - positiveEvidence * 4 + triggerPressure * 0.18 - safePressure * 0.16);
  return clamp(100 - reactivity);
}

function symptomFreeConsistencyComponent(recentReports: DailyGutReport[], reportCount: number) {
  if (!recentReports.length) return reportCount > 0 ? 48 : 40;

  const calmCount = recentReports.filter((report) => report.gutSeverity <= 3).length;
  const neutralCount = recentReports.filter((report) => report.gutSeverity >= 4 && report.gutSeverity <= 6).length;
  const reactiveCount = recentReports.filter((report) => report.gutSeverity >= 7).length;
  const calmRate = calmCount / Math.max(recentReports.length, 1);

  const reactivity = clamp(82 - calmRate * 72 + neutralCount * 3 + reactiveCount * 8);
  return clamp(100 - reactivity);
}

function dataConfidenceComponent(reportCount: number, recentReports: DailyGutReport[]) {
  return clamp(100 - clamp(90 - reportCount * 7 - recentReports.length * 5));
}

function dailyScoreMovementLimit(dailyScore?: number) {
  if (typeof dailyScore !== 'number' || !Number.isFinite(dailyScore)) return 0;
  const score = clamp(dailyScore);
  if (score <= 10 || score >= 95) return 4;
  if (score <= 25 || score >= 90) return 3;
  if (score <= 33 || score >= 80) return 2;
  return 1;
}

function movementLimitForSource(source?: GutScoreMovementSource, movementDailyScore?: number) {
  switch (source) {
    case 'scan':
      return 0;
    case 'daily_report':
      return dailyScoreMovementLimit(movementDailyScore);
    case 'profile':
      return 8;
    case 'backfill':
      return undefined;
    default:
      return undefined;
  }
}

function applyMovementLimit(
  rawScore: number,
  previousScore: GutScoreState | null | undefined,
  source?: GutScoreMovementSource,
  movementDailyScore?: number,
) {
  const limit = movementLimitForSource(source, movementDailyScore);
  if (typeof limit !== 'number' || typeof previousScore?.currentScore !== 'number') {
    return rawScore;
  }

  if (source === 'daily_report') {
    if (typeof movementDailyScore !== 'number' || !Number.isFinite(movementDailyScore)) {
      return previousScore.currentScore;
    }
    const targetDelta = clamp(movementDailyScore) - previousScore.currentScore;
    if (Math.abs(targetDelta) < 1) {
      return previousScore.currentScore;
    }
    return clamp(previousScore.currentScore + clampNumber(targetDelta, -limit, limit));
  }

  const delta = clampNumber(rawScore - previousScore.currentScore, -limit, limit);
  return clamp(previousScore.currentScore + delta);
}

function gutScorePhase(score: number, reportCount: number, recentReports: DailyGutReport[]) {
  const recentSevereCount = recentReports.filter((report) => report.gutSeverity >= 9).length;
  const recentReactiveCount = recentReports.filter((report) => report.gutSeverity >= 7).length;
  const recentCalmCount = recentReports.filter((report) => report.gutSeverity <= 3).length;

  if (score <= 45 || recentSevereCount > 0 || recentReactiveCount >= 2) return 'learn' as const;
  if (reportCount >= 8 && score >= 76 && recentSevereCount === 0 && recentCalmCount >= 3) return 'reintroduce' as const;
  if (reportCount >= 3 && score >= 62 && recentReactiveCount <= 1) return 'calm' as const;
  return 'learn' as const;
}

function buildGutScoreDrivers(
  score: number,
  phase: GutScorePhase,
  answers: OnboardingAnswers,
  insights: IngredientInsight[],
  recentReports: DailyGutReport[],
  dataConfidence: number,
): GutScoreDriver[] {
  const drivers: GutScoreDriver[] = [];
  const latestReport = [...recentReports].sort((left, right) => scoreEventTime(right.updatedAt) - scoreEventTime(left.updatedAt))[0];
  const topTrigger = [...insights]
    .filter((insight) => insight.negativeEvidenceCount > 0)
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.negativeEvidenceCount - left.negativeEvidenceCount)[0];
  const topSafe = [...insights]
    .filter((insight) => insight.positiveEvidenceCount > 0 && insight.safeScore >= insight.triggerScore)
    .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore || right.positiveEvidenceCount - left.positiveEvidenceCount)[0];

  if (latestReport && latestReport.gutSeverity >= 7) {
    drivers.push({
      id: 'recent-symptom',
      label: latestReport.gutSeverity >= 9 ? 'Recent severe reaction' : 'Recent symptoms',
      detail: latestReport.gutSeverity >= 9 ? 'Severe symptoms lowered your score.' : 'Reactive symptoms lowered your score.',
      impact: 'lowers',
      weight: latestReport.gutSeverity >= 9 ? 92 : 68,
    });
  }

  if (latestReport && latestReport.gutSeverity <= 3) {
    drivers.push({
      id: 'felt-good',
      label: 'Calm daily report',
      detail: 'Calm daily report raised your score.',
      impact: 'raises',
      weight: 72,
    });
  }

  if (topTrigger) {
    drivers.push({
      id: `trigger-${normalizeKey(topTrigger.ingredientName)}`,
      label: `${topTrigger.ingredientName} may be lowering your score`,
      detail: `${topTrigger.ingredientName} appears on reactive days.`,
      impact: 'lowers',
      weight: topTrigger.combinedRiskScore,
    });
  }

  if (topSafe) {
    drivers.push({
      id: `safe-${normalizeKey(topSafe.ingredientName)}`,
      label: `${topSafe.ingredientName} is looking gentler`,
      detail: `${topSafe.ingredientName} appears on calm days.`,
      impact: 'raises',
      weight: 100 - topSafe.combinedRiskScore,
    });
  }

  if (dataConfidence < 45) {
    drivers.push({
      id: 'needs-reports',
      label: 'Needs more reports',
      detail: 'The score needs daily reports before it can move confidently.',
      impact: 'neutral',
      weight: 100 - dataConfidence,
    });
  } else if (dataConfidence >= 60) {
    drivers.push({
      id: 'report-confidence',
      label: 'Growing confidence',
      detail: 'More daily reports improved confidence in your score.',
      impact: 'raises',
      weight: dataConfidence,
    });
  }

  if (!drivers.length) {
    drivers.push({
      id: 'baseline',
      label: phase === 'reintroduce' ? 'Stable recent pattern' : 'Starting profile',
      detail: score <= 40
        ? 'Your score is mostly based on your baseline symptoms and declared sensitivities.'
        : 'Your recent outcomes are helping your Gut Score hold steadier.',
      impact: score >= 67 ? 'raises' : score <= 33 ? 'lowers' : 'neutral',
      weight: score,
    });
  }

  if (foodsToReintroduceFromAnswers(answers).length && phase === 'reintroduce') {
    drivers.push({
      id: 'reintroduction-ready',
      label: 'Ready to test tolerance',
      detail: `${foodsToReintroduceFromAnswers(answers)[0]} can become a future reintroduction target if your score stays calm.`,
      impact: 'neutral',
      weight: 44,
    });
  }

  return drivers.sort((left, right) => right.weight - left.weight).slice(0, 4);
}

function nextGutScoreAction(phase: GutScorePhase, drivers: GutScoreDriver[], answers: OnboardingAnswers, insights: IngredientInsight[]) {
  if (phase === 'calm') {
    const triggerDriver = drivers.find((driver) => driver.impact === 'lowers' && driver.id.startsWith('trigger-'));
    return triggerDriver
      ? `Reduce ${triggerDriver.label.replace(' may be lowering your score', '')} for a few days and keep logging daily reports.`
      : 'Log your next meal and report how your day feels so we can keep raising confidence.';
  }

  if (phase === 'reintroduce') {
    const target = foodsToReintroduceFromAnswers(answers)[0] ?? insights.find((insight) => insight.positiveEvidenceCount >= 3)?.ingredientName;
    return target
      ? `Your score is strong. Consider testing a small amount of ${target} when you feel stable.`
      : 'Your score is strong. Keep logging gentle meals before testing bigger trigger foods.';
  }

  return 'Keep logging food and daily reports so we can separate true triggers from one-off reactions.';
}

function historyWithCurrent(history: GutScoreHistoryPoint[] = [], currentScore: number, updatedAt: string) {
  return [...history, { score: currentScore, createdAt: updatedAt }]
    .sort((left, right) => scoreEventTime(left.createdAt) - scoreEventTime(right.createdAt))
    .slice(-14);
}

function computeTrendDelta(currentScore: number, history: GutScoreHistoryPoint[], nowMs: number) {
  if (!history.length) return 0;
  const chronologicalHistory = [...history].sort((left, right) => scoreEventTime(left.createdAt) - scoreEventTime(right.createdAt));
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const oldestEligible = chronologicalHistory
    .filter((point) => scoreEventTime(point.createdAt) <= sevenDaysAgo)
    .sort((left, right) => scoreEventTime(right.createdAt) - scoreEventTime(left.createdAt))[0];
  const comparison = oldestEligible ?? chronologicalHistory[0];

  return comparison ? currentScore - comparison.score : 0;
}

export function computeGutScoreState(params: {
  answers: OnboardingAnswers;
  insights: IngredientInsight[];
  scans: ScanRecord[];
  dailyReports: DailyGutReport[];
  previousGutScore?: GutScoreState | null;
  movementSource?: GutScoreMovementSource;
  movementDailyScore?: number;
  now?: string;
}): GutScoreState {
  const updatedAt = params.now ?? new Date().toISOString();
  const nowMs = scoreEventTime(updatedAt);
  const baselineScore = baselineGutScore(params.answers);
  const reportCount = params.dailyReports.length;
  // Exposure-only "watching" rows (scanned, never paired with a check-in)
  // carry no outcome evidence and must not move the score — their flat risk-50
  // would otherwise shadow ingredientBaselineRisk for every unpaired scan.
  const insights = params.insights.filter(hasPairedEvidence);
  const recentReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 7, nowMs));
  const monthReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 30, nowMs));
  const recentDailyOutcome = clamp(averageScore(
    (recentReports.length ? recentReports : monthReports).map((report) => report.dailyScore ?? symptomDailyScore(report.gutSeverity)),
    baselineScore,
  ));
  const recentFoodLoad = recentFoodLoadComponent(params.answers, insights, params.scans, nowMs);
  const symptomFreeConsistency = symptomFreeConsistencyComponent(recentReports, reportCount);
  const personalizedIngredientEvidence = personalizedIngredientEvidenceComponent(insights);
  const dataConfidence = dataConfidenceComponent(reportCount, recentReports);

  let currentScore = clamp(
    recentDailyOutcome * 0.5 +
      symptomFreeConsistency * 0.2 +
      personalizedIngredientEvidence * 0.15 +
      recentFoodLoad * 0.1 +
      dataConfidence * 0.05,
  );

  if (reportCount === 0) {
    currentScore = baselineScore;
  } else if (!recentReports.length) {
    currentScore = Math.min(currentScore, Math.max(28, baselineScore + 4));
  }
  currentScore = applyMovementLimit(
    currentScore,
    params.previousGutScore,
    params.movementSource,
    params.movementDailyScore,
  );

  const phase = gutScorePhase(currentScore, reportCount, recentReports);
  const confidenceLevel = gutScoreConfidence(reportCount);
  const sourceHistory = params.previousGutScore?.history ?? [];
  const trendDelta7d = computeTrendDelta(currentScore, sourceHistory, nowMs);
  const drivers = buildGutScoreDrivers(currentScore, phase, params.answers, insights, recentReports, dataConfidence);

  return {
    algorithmVersion: GUT_SCORE_ALGORITHM_VERSION,
    currentScore,
    baselineScore,
    phase,
    confidenceLevel,
    trendDelta7d,
    trendDirection: gutScoreTrendDirection(trendDelta7d),
    components: {
      recentDailyOutcome,
      symptomFreeConsistency,
      personalizedIngredientEvidence,
      recentFoodLoad,
      dataConfidence,
    },
    drivers,
    history: historyWithCurrent(sourceHistory, currentScore, updatedAt),
    nextAction: nextGutScoreAction(phase, drivers, params.answers, insights),
    updatedAt,
    recentEvent: params.previousGutScore?.recentEvent,
  };
}

export function buildGutScoreEvent(params: {
  eventType: string;
  score: GutScoreState;
  previousScore?: GutScoreState | null;
}): GutScoreEvent {
  const scoreBefore = params.previousScore?.currentScore;
  const scoreDelta = typeof scoreBefore === 'number' ? params.score.currentScore - scoreBefore : 0;
  const primaryDriver = params.score.drivers[0];
  const phaseChanged = params.previousScore?.phase && params.previousScore.phase !== params.score.phase;

  return {
    eventType: params.eventType,
    algorithmVersion: params.score.algorithmVersion,
    scoreBefore,
    scoreAfter: params.score.currentScore,
    scoreDelta,
    phaseBefore: params.previousScore?.phase,
    phaseAfter: params.score.phase,
    summary: phaseChanged
      ? `You moved into ${params.score.phase} mode. ${params.score.nextAction}`
      : scoreDelta > 0
        ? `Gut Score improved by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
        : scoreDelta < 0
          ? `Gut Score dropped by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
          : primaryDriver?.detail ?? params.score.nextAction,
    drivers: params.score.drivers,
    createdAt: params.score.updatedAt,
  };
}

export function buildUserProfile(
  userId: string,
  answers: OnboardingAnswers,
  priorInsights: IngredientInsight[] = [],
  options: {
    learningProgress?: ProfileLearningProgress;
    reportCount?: number;
  } = {},
): UserProfile {
  const knownConditions = [...answers.conditions, ...answers.customConditions].filter(Boolean);
  const knownIngredientSensitivities = [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ].filter(Boolean);
  const displayName = answers.displayName.trim() || undefined;
  const gutScore = computeGutScoreState({
    answers,
    insights: priorInsights,
    scans: [],
    dailyReports: [],
  });

  return {
    userId,
    displayName,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])],
    symptomFrequency: answers.symptomFrequency,
    symptomSeverityBaseline: answers.symptomSeverityBaseline,
    mealContexts: answers.mealContexts,
    motivation: answers.motivation,
    currentEatingPatterns: answers.currentEatingPatterns ?? [],
    lifestyleFactors: answers.lifestyleFactors ?? [],
    foodsToReintroduce: foodsToReintroduceFromAnswers(answers),
    dietPreferences: (answers.dietPreferenceKeys ?? []).map((key) => ({
      key,
      label: dietPreferenceLabelFromKey(key),
      strictness: 'standard' as const,
      source: 'onboarding' as const,
    })),
    stomachProfile: {
      version: 3,
      conditions: knownConditions.map((name) => ({ name, source: 'user' as const, active: true })),
      declaredIngredientSensitivities: knownIngredientSensitivities.map((name) => ({
        name,
        source: 'user' as const,
        active: true,
      })),
      ingredientScores: toIngredientScores(priorInsights),
      conditionSensitivityWeights: deriveConditionSensitivityWeights(
        knownConditions,
        [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])],
        answers.symptomFrequency,
        answers.symptomSeverityBaseline,
      ),
      freeformCustomNotes: [],
      metadata: {
        profileConfidenceLevel: options.learningProgress?.stage ?? profileConfidenceLevel(0, 0),
        reportCount: options.reportCount ?? 0,
        learningEvidenceDays: options.learningProgress?.pairedReportDays ?? 0,
        learningMealScanCount: options.learningProgress?.pairedMealScans ?? 0,
        learnedIngredientCount: priorInsights.length,
        topTriggers: topTriggerSignals(priorInsights),
        topSafeFoods: topSafeFoodSignals(priorInsights),
        declaredSensitivities: knownIngredientSensitivities,
        recentLearningEvent: recentLearningEvent(priorInsights),
        gutScore,
      },
    },
  };
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
    declared: declaredSensitivities.some((sensitivity) => ingredientMatchesSensitivityLabel(ingredientName, sensitivity)),
    science: Boolean(ingredientConditionImpacts[normalizeKey(ingredientName)]),
    personal: hasPersonalEvidence,
    positiveEvidenceCount,
    negativeEvidenceCount,
  };
}

function localDateFromScan(scan: { localDate?: string; createdAt?: string }) {
  if (scan.localDate) {
    return scan.localDate;
  }

  return (scan.createdAt ?? new Date().toISOString()).slice(0, 10);
}

function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function computeProfileLearningProgress(
  scans: {
    id?: string;
    localDate?: string;
    createdAt?: string;
    completedAt?: string;
    scanCategory?: string;
    consumptionStatus?: string;
  }[],
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

  const pairedReportDays = pairedReportDates.size;
  const pairedMealScans = pairedScanIds.size;
  return profileLearningProgressFromCounts(pairedReportDays, pairedMealScans);
}

export function profileLearningProgressFromCounts(
  pairedReportDays: number,
  pairedMealScans: number,
): ProfileLearningProgress {
  const stage = profileConfidenceLevel(pairedReportDays, pairedMealScans);
  const reportProgress = Math.min(1, pairedReportDays / PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedReportDays);
  const mealScanProgress = Math.min(1, pairedMealScans / PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedMealScans);

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

function groupFoodScansByLocalDate(
  scans: {
    structuredAnalysis: StructuredAnalysisV2;
    overallRiskScore?: number;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
) {
  const scansByDate = new Map<string, typeof scans>();
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

function uniqueIngredientsForScans(
  scans: { structuredAnalysis: StructuredAnalysisV2; createdAt?: string }[],
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
  scans: {
    id: string;
    structuredAnalysis: StructuredAnalysisV2;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
  dailyReports: DailyGutReport[],
  options: {
    declaredSensitivities?: string[];
    activeConditions?: string[];
  } = {},
): IngredientInsight[] {
  const scansByDate = groupFoodScansByLocalDate(scans);

  // Distinct scan dates per ingredient — the exposure denominator (mirrors the
  // server's insights-learning engine).
  const exposure = new Map<string, { days: Set<string>; lastSeenAt: string }>();
  for (const [localDate, scansForDate] of scansByDate) {
    for (const ingredient of uniqueIngredientsForScans(scansForDate).values()) {
      const key = normalizeKey(ingredient.name);
      if (!key) continue;
      const current = exposure.get(key) ?? { days: new Set<string>(), lastSeenAt: ingredient.lastSeenAt };
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
      // weights — one calm check-in reads as exactly one calm day.
      const positiveEvidenceCount = current.calmDays.size;
      const negativeEvidenceCount = current.reactiveDays.size;
      const pairedDayCount = new Set([...current.calmDays, ...current.reactiveDays, ...current.neutralDays]).size;
      const exposureDayCount = exposure.get(ingredientName)?.days.size ?? 0;

      return {
        id: `insight-${index}-${ingredientName}`,
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
        summary: positiveEvidenceCount + negativeEvidenceCount === 0
          ? `${ingredientName} is paired with symptom reports but has no clear calm or reactive pattern yet.`
          : dominatesTrigger
            ? `${ingredientName} showed up around ${negativeEvidenceCount} rough day${negativeEvidenceCount === 1 ? '' : 's'} out of ${pairedDayCount} paired.`
            : `${ingredientName} has been calm on ${positiveEvidenceCount} of ${pairedDayCount} paired day${pairedDayCount === 1 ? '' : 's'}.`,
      };
    });

  const pairedNames = new Set(paired.map((insight) => insight.ingredientName));
  const exposureOnly = [...exposure.entries()]
    .filter(([name]) => !pairedNames.has(name))
    .sort((left, right) => right[1].days.size - left[1].days.size || left[0].localeCompare(right[0]))
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

  return [...paired, ...exposureOnly]
    .sort((a, b) => b.combinedRiskScore - a.combinedRiskScore || b.supportingEvidenceCount - a.supportingEvidenceCount);
}

export function recomputeConditionIngredientInsights(
  scans: {
    id: string;
    structuredAnalysis: StructuredAnalysisV2;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
  dailyReports: DailyGutReport[],
  options: {
    activeConditions?: string[];
    declaredSensitivities?: string[];
  } = {},
): ConditionIngredientInsight[] {
  const insights = recomputeInsights(scans, dailyReports, options);
  const conditions = options.activeConditions?.length ? options.activeConditions.slice(0, 3) : ['Sensitive stomach'];

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
    .sort((a, b) => b.riskScore - a.riskScore || b.supportingEvidenceCount - a.supportingEvidenceCount)
    .slice(0, 24);
}

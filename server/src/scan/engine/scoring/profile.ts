import {
  IngredientInsight,
  PredictiveValidityStats,
  ProfileSeed,
  ScanForInsightRecompute,
  StomachProfile,
  UserProfile,
} from '../domain';
import {
  DAILY_ATTRIBUTION_WINDOWS,
  PROFILE_LEARNING_STAGE_THRESHOLDS,
  clamp,
  profileConfidenceLevel,
  type ProfileLearningProgress,
} from '@mth/shared-domain';
import { toIngredientScores } from './internal';
import { localDateFromScan, localDateMinusDays } from './scan-data';
import {
  deriveConditionSensitivityWeights,
  recentLearningEvent,
  topSafeFoodSignals,
  topTriggerSignals,
} from './seed-insights';

export function buildUserProfileFromSeed(
  seed: ProfileSeed,
  priorInsights: IngredientInsight[] = [],
  options: {
    priorStomachProfile?: Partial<StomachProfile> | null;
    reportCount?: number;
    learningProgress?: ProfileLearningProgress;
    predictiveValidity?: PredictiveValidityStats | null;
  } = {},
): UserProfile {
  const knownConditions = [...seed.knownConditions].filter(Boolean);
  const knownIngredientSensitivities = [...seed.knownIngredientSensitivities].filter(Boolean);
  const reportCount = options.reportCount ?? options.priorStomachProfile?.metadata?.reportCount ?? 0;
  const priorStomachProfile = options.priorStomachProfile ?? null;
  const derivedConditionSensitivityWeights = deriveConditionSensitivityWeights(
    knownConditions,
    seed.commonSymptoms,
    seed.symptomFrequency,
    seed.symptomSeverityBaseline,
    priorStomachProfile?.conditionSensitivityWeights ?? {},
  );

  return {
    userId: seed.userId,
    displayName: seed.displayName?.trim() || undefined,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: seed.commonSymptoms,
    symptomFrequency: seed.symptomFrequency,
    symptomSeverityBaseline: seed.symptomSeverityBaseline,
    mealContexts: seed.mealContexts,
    motivation: seed.motivation,
    currentEatingPatterns: seed.currentEatingPatterns ?? [],
    lifestyleFactors: seed.lifestyleFactors ?? [],
    foodsToReintroduce: seed.foodsToReintroduce ?? [],
    dietPreferences: seed.dietPreferences ?? [],
    stomachProfile: {
      version: 3,
      conditions: knownConditions.map((name) => ({ name, source: 'user' as const, active: true })),
      declaredIngredientSensitivities: knownIngredientSensitivities.map((name) => ({
        name,
        source: 'user' as const,
        active: true,
      })),
      ingredientScores: toIngredientScores(priorInsights),
      conditionSensitivityWeights: derivedConditionSensitivityWeights,
      freeformCustomNotes: priorStomachProfile?.freeformCustomNotes ?? [],
      metadata: {
        profileConfidenceLevel: options.learningProgress?.stage ?? profileConfidenceLevel(0, 0),
        reportCount,
        learningEvidenceDays: options.learningProgress?.pairedReportDays ?? 0,
        learningMealScanCount: options.learningProgress?.pairedMealScans ?? 0,
        learnedIngredientCount: priorInsights.length,
        topTriggers: topTriggerSignals(priorInsights),
        topSafeFoods: topSafeFoodSignals(priorInsights),
        declaredSensitivities: knownIngredientSensitivities,
        recentLearningEvent: recentLearningEvent(priorInsights),
        gutScore: priorStomachProfile?.metadata?.gutScore,
        predictiveValidity:
          options.predictiveValidity ?? priorStomachProfile?.metadata?.predictiveValidity,
      },
    },
  };
}

export function computeProfileLearningProgress(
  scans: ScanForInsightRecompute[],
  dailyReports: Array<{ localDate: string }>,
): ProfileLearningProgress {
  const scansByDate = new Map<string, Array<{ id: string }>>();

  scans.forEach((scan, index) => {
    if ((scan.scanCategory ?? 'food') !== 'food') {
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

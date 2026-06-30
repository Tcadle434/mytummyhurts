// Barrel for the scan scoring engine. The implementation lives in focused
// modules under ./scoring/*; this file only re-exports the public surface so
// every existing `import { ... } from '.../engine/scoring'` keeps working.
//
// Re-exported from @mth/shared-domain so existing call sites
// (`import { ... } from '.../engine/scoring'`) keep working now that these live
// in @mth/shared-domain.
export {
  GUT_SCORE_ALGORITHM_VERSION,
  PROFILE_LEARNING_STAGE_THRESHOLDS,
  type ProfileLearningProgress,
} from '@mth/shared-domain';

export {
  flattenStructuredIngredients,
  toRiskLevel,
  formatConditionName,
  type ScanScoringOptions,
} from './scoring/internal';

export {
  buildDeclaredSeedInsights,
  mergeSeedAndLearnedInsights,
} from './scoring/seed-insights';

export {
  computeDailyScoreForReport,
  recomputeDailyScores,
} from './scoring/daily-score';

export {
  computeGutScoreState,
  buildGutScoreEvent,
} from './scoring/gut-score';

export {
  buildUserProfileFromSeed,
  computeProfileLearningProgress,
} from './scoring/profile';

export { computeScanResultFromStructured } from './scoring/scan-scoring';

export {
  computeMenuScanResultFromExtraction,
  fallbackExtractionFromText,
  fallbackExtractionFromImage,
} from './scoring/menu-scoring';

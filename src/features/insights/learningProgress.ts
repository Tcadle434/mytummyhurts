import {
  computeProfileLearningProgress,
  profileLearningProgressFromCounts,
  type ProfileLearningProgress,
} from '../../services/ai/scoring';
import type { DailyGutReport, ScanRecord, UserProfile } from '../../types/domain';

export function resolveTriggerProfileLearningProgress(input: {
  liveBackendConfigured: boolean;
  profile: UserProfile | null | undefined;
  fallbackScans: ScanRecord[];
  fallbackDailyReports: DailyGutReport[];
}): ProfileLearningProgress {
  const metadata = input.profile?.stomachProfile.metadata;
  if (input.liveBackendConfigured && input.profile) {
    return profileLearningProgressFromCounts(
      metadata?.learningEvidenceDays ?? 0,
      metadata?.learningMealScanCount ?? 0,
    );
  }

  if (input.fallbackScans.length > 0) {
    return computeProfileLearningProgress(input.fallbackScans, input.fallbackDailyReports);
  }

  return profileLearningProgressFromCounts(
    metadata?.learningEvidenceDays ?? 0,
    metadata?.learningMealScanCount ?? 0,
  );
}

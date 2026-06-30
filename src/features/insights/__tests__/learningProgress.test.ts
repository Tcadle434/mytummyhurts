import { describe, expect, it } from 'vitest';

import { resolveTriggerProfileLearningProgress } from '../learningProgress';
import type { DailyGutReport, ScanRecord, UserProfile } from '../../../types/domain';

function profileWithProgress(reportDays: number, mealScans: number): UserProfile {
  return {
    stomachProfile: {
      metadata: {
        learningEvidenceDays: reportDays,
        learningMealScanCount: mealScans,
      },
    },
  } as UserProfile;
}

function scan(id: string, localDate: string): ScanRecord {
  return {
    id,
    scanCategory: 'food',
    consumptionStatus: 'consumed',
    localDate,
    createdAt: `${localDate}T12:00:00.000Z`,
  } as ScanRecord;
}

function report(localDate: string): DailyGutReport {
  return {
    id: `report-${localDate}`,
    localDate,
    userId: 'test-user',
    gutSeverity: 5,
    symptomTags: [],
    createdAt: `${localDate}T20:00:00.000Z`,
    updatedAt: `${localDate}T20:00:00.000Z`,
  };
}

describe('resolveTriggerProfileLearningProgress', () => {
  it('prefers server profile metadata when live backend data exists', () => {
    const progress = resolveTriggerProfileLearningProgress({
      liveBackendConfigured: true,
      profile: profileWithProgress(1, 2),
      fallbackScans: [scan('stale-scan', '2026-06-23')],
      fallbackDailyReports: [report('2026-06-23')],
    });

    expect(progress.pairedReportDays).toBe(1);
    expect(progress.pairedMealScans).toBe(2);
  });

  it('uses local recompute as an offline fallback', () => {
    const progress = resolveTriggerProfileLearningProgress({
      liveBackendConfigured: false,
      profile: profileWithProgress(0, 0),
      fallbackScans: [scan('scan-1', '2026-06-23'), scan('scan-2', '2026-06-23')],
      fallbackDailyReports: [report('2026-06-23')],
    });

    expect(progress.pairedReportDays).toBe(1);
    expect(progress.pairedMealScans).toBe(2);
  });
});

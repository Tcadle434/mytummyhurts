import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { normalizeOnboardingAnswers, defaultOnboardingAnswers } from '../data/onboarding';
import { IngredientInsight, RiskLevel, ScanRecord } from '../types/domain';
import { createAccountActions } from './actions/accountActions';
import { createLearningActions } from './actions/learningActions';
import { createOnboardingActions } from './actions/onboardingActions';
import { createReportActions } from './actions/reportActions';
import { createScanActions } from './actions/scanActions';
import { AppStoreState, defaultBillingState } from './types';

export type { AppStoreState } from './types';

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      onboardingStage: 'intro',
      onboardingStepIndex: 0,
      onboardingAnswers: defaultOnboardingAnswers,
      authUser: null,
      profile: null,
      billing: defaultBillingState,
      scans: [],
      dailyReports: [],
      insights: [],
      conditionInsights: [],
      initialServerSyncNeeded: false,
      serverSyncInFlight: false,
      serverSyncError: null,
      learningSyncInFlight: false,
      learningSyncRequestId: null,
      learningSyncError: null,
      learningSyncSource: null,
      remoteDataLoaded: false,
      reportPayoffBaseline: null,
      ...createOnboardingActions(set, get),
      ...createAccountActions(set, get),
      ...createScanActions(set, get),
      ...createReportActions(set, get),
      ...createLearningActions(set, get),
    }),
    {
      name: 'mytummyhurts-store',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AppStoreState> | undefined;
        return {
          ...current,
          ...persistedState,
          onboardingAnswers: normalizeOnboardingAnswers(persistedState?.onboardingAnswers),
          remoteDataLoaded: false,
        };
      },
      partialize: (state) => ({
        onboardingStage: state.onboardingStage,
        onboardingStepIndex: state.onboardingStepIndex,
        onboardingAnswers: state.onboardingAnswers,
        authUser: state.authUser,
        profile: state.profile,
        billing: state.billing,
        scans: state.scans,
        dailyReports: state.dailyReports,
        insights: state.insights,
        conditionInsights: state.conditionInsights,
        initialServerSyncNeeded: state.initialServerSyncNeeded,
        serverSyncError: state.serverSyncError,
      }),
    },
  ),
);

export function selectLatestScan(scans: ScanRecord[], scanId: string) {
  return scans.find((scan) => scan.id === scanId);
}

export function selectInsightBuckets(insights: IngredientInsight[]) {
  return {
    triggers: insights
      .filter((insight) => insight.triggerScore >= insight.safeScore || insight.combinedRiskScore >= 52)
      .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore)
      .slice(0, 8),
    safeFoods: insights
      .filter((insight) => insight.safeScore > insight.triggerScore || insight.combinedRiskScore <= 44)
      .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore)
      .slice(0, 8),
  };
}

export function createRiskTone(level: RiskLevel) {
  if (level === 'high') {
    return 'Watch-out';
  }

  if (level === 'medium') {
    return 'Mixed';
  }

  return 'Gentle';
}

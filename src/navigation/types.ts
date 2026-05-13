import { NavigatorScreenParams } from '@react-navigation/native';

import { ScanInputPayload } from '../types/domain';

export type OnboardingStackParamList = {
  GetStarted: undefined;
  OnboardingFlow: undefined;
  OnboardingPaywall: undefined;
  OnboardingAuth: undefined;
  FirstScanLanding: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Insights: undefined;
  Symptoms: undefined;
};

export type RootStackParamList = {
  OnboardingStack: NavigatorScreenParams<OnboardingStackParamList>;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Settings: undefined;
  ScanCapture: {
    sourceType?: ScanInputPayload['sourceType'];
    manualMode?: boolean;
    fromOnboarding?: boolean;
  };
  ScanAnalyzing: {
    payload: ScanInputPayload;
    manualMode?: boolean;
    fromOnboarding?: boolean;
  };
  ScanResult: {
    scanId: string;
    manualMode?: boolean;
    fromOnboarding?: boolean;
  };
  DailyGutReport: {
    localDate?: string;
  };
  WeeklyProgress: undefined;
  DailyScoreDay: {
    localDate: string;
    weekStart?: string;
  };
  GutScoreDetail: undefined;
  ManualMeal: {
    scanId?: string;
  };
  LegalDocument: {
    document: 'privacy' | 'terms';
  };
  DesignSystemShowcase: undefined;
  InsightDetail: {
    ingredientName: string;
  };
};

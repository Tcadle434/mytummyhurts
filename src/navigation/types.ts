import { NavigatorScreenParams } from '@react-navigation/native';

import { ScanInputPayload } from '../types/domain';

export type OnboardingStackParamList = {
  GetStarted: undefined;
  OnboardingFlow: undefined;
  OnboardingPaywall: undefined;
  OnboardingAuth: undefined;
  OnboardingSignIn: undefined;
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
  FinishingSetup: undefined;
  Settings: undefined;
  ScanCapture: {
    sourceType?: ScanInputPayload['sourceType'];
    manualMode?: boolean;
    scanCategory?: ScanInputPayload['scanCategory'];
    initialMode?: 'food' | 'menu' | 'barcode';
  };
  ScanAnalyzing: {
    payload: ScanInputPayload;
    manualMode?: boolean;
  };
  ScanResult: {
    scanId: string;
    manualMode?: boolean;
  };
  DailyGutReport: {
    localDate?: string;
  };
  DailyReportPayoff: {
    localDate: string;
  };
  WeeklyProgress: undefined;
  DailyScoreDay: {
    localDate: string;
    weekStart?: string;
  };
  ManualMeal: {
    scanId?: string;
  };
  LegalDocument: {
    document: 'privacy' | 'terms' | 'science';
  };
  DesignSystemShowcase: undefined;
  InsightDetail: {
    ingredientName?: string;
    groupKey?: string;
  };
};

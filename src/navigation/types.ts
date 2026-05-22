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
  Settings: undefined;
  ScanCapture: {
    sourceType?: ScanInputPayload['sourceType'];
    manualMode?: boolean;
    scanCategory?: ScanInputPayload['scanCategory'];
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
  WeeklyProgress: undefined;
  DailyScoreDay: {
    localDate: string;
    weekStart?: string;
  };
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

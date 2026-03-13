import { NavigatorScreenParams } from '@react-navigation/native';

import { ScanInputPayload } from '../types/domain';

export type OnboardingStackParamList = {
  OnboardingFlow: undefined;
  OnboardingPaywall: undefined;
  OnboardingAuth: undefined;
  FirstScanLanding: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Insights: undefined;
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
    mealId: string;
    manualMode?: boolean;
    fromOnboarding?: boolean;
  };
  FollowUp: {
    mealId: string;
  };
  ManualMeal: {
    scanId?: string;
  };
  LegalDocument: {
    document: 'privacy' | 'terms';
  };
  InsightDetail: {
    ingredientName: string;
  };
};

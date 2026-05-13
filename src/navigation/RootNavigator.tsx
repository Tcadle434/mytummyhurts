import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CustomTabBar } from './CustomTabBar';
import { MainTabParamList, OnboardingStackParamList, RootStackParamList } from './types';
import { AuthScreen } from '../screens/auth/AuthScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { ManualMealScreen } from '../screens/history/ManualMealScreen';
import { DailyGutReportScreen } from '../screens/home/DailyGutReportScreen';
import { GutScoreDetailScreen } from '../screens/home/GutScoreDetailScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { DesignSystemShowcaseScreen } from '../screens/internal/DesignSystemShowcaseScreen';
import { InsightDetailScreen } from '../screens/insights/InsightDetailScreen';
import { InsightsScreen } from '../screens/insights/InsightsScreen';
import { FirstScanLandingScreen } from '../screens/onboarding/FirstScanLandingScreen';
import { GetStartedScreen } from '../screens/onboarding/GetStartedScreen';
import { OnboardingFlowScreen } from '../screens/onboarding/OnboardingFlowScreen';
import { PaywallScreen } from '../screens/paywall/PaywallScreen';
import { DailyScoreDayScreen } from '../screens/progress/DailyScoreDayScreen';
import { WeeklyProgressScreen } from '../screens/progress/WeeklyProgressScreen';
import { ScanAnalyzingScreen } from '../screens/scan/ScanAnalyzingScreen';
import { ScanCaptureScreen } from '../screens/scan/ScanCaptureScreen';
import { ScanResultScreen } from '../screens/scan/ScanResultScreen';
import { LegalDocumentScreen } from '../screens/settings/LegalDocumentScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { SymptomLogScreen } from '../screens/symptoms/SymptomLogScreen';
import { navigationRef } from './navigationRef';
import { useAppStore } from '../store/useAppStore';
import { palette } from '../theme';
import { OnboardingStage } from '../types/domain';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function getInitialOnboardingRoute(onboardingStage: OnboardingStage): keyof OnboardingStackParamList {
  if (onboardingStage === 'intro') return 'GetStarted';
  if (onboardingStage === 'paywall') return 'OnboardingPaywall';
  if (onboardingStage === 'auth') return 'OnboardingAuth';
  if (onboardingStage === 'landing') return 'FirstScanLanding';
  return 'OnboardingFlow';
}

function OnboardingNavigator() {
  const onboardingStage = useAppStore((state) => state.onboardingStage);

  return (
    <OnboardingStack.Navigator
      initialRouteName={getInitialOnboardingRoute(onboardingStage)}
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <OnboardingStack.Screen name="GetStarted" component={GetStartedScreen} />
      <OnboardingStack.Screen name="OnboardingFlow" component={OnboardingFlowScreen} />
      <OnboardingStack.Screen name="OnboardingPaywall" component={PaywallScreen} />
      <OnboardingStack.Screen name="OnboardingAuth" component={AuthScreen} />
      <OnboardingStack.Screen name="FirstScanLanding" component={FirstScanLandingScreen} />
    </OnboardingStack.Navigator>
  );
}

function MainTabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Symptoms" component={SymptomLogScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const onboardingStage = useAppStore((state) => state.onboardingStage);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: palette.background,
          card: palette.card,
          text: palette.text,
          primary: palette.primary,
          border: palette.border,
        },
      }}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {onboardingStage === 'complete' ? (
          <RootStack.Screen name="MainTabs" component={MainTabsNavigator} />
        ) : (
          <RootStack.Screen name="OnboardingStack" component={OnboardingNavigator} />
        )}
        <RootStack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="DesignSystemShowcase" component={DesignSystemShowcaseScreen} />
        <RootStack.Screen name="ScanCapture" component={ScanCaptureScreen} options={{ presentation: 'fullScreenModal' }} />
        <RootStack.Screen name="ScanAnalyzing" component={ScanAnalyzingScreen} options={{ presentation: 'fullScreenModal' }} />
        <RootStack.Screen name="ScanResult" component={ScanResultScreen} />
        <RootStack.Screen name="DailyGutReport" component={DailyGutReportScreen} />
        <RootStack.Screen name="WeeklyProgress" component={WeeklyProgressScreen} />
        <RootStack.Screen name="DailyScoreDay" component={DailyScoreDayScreen} />
        <RootStack.Screen name="GutScoreDetail" component={GutScoreDetailScreen} />
        <RootStack.Screen name="ManualMeal" component={ManualMealScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="InsightDetail" component={InsightDetailScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

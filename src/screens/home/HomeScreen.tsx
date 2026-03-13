import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { Gauge } from '../../components/charts/Gauge';
import {
  AppScreen,
  AvatarButton,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  Wordmark,
} from '../../components/common/UI';
import { useHistoryFeed } from '../../features/history/hooks';
import { useInsightsData } from '../../features/insights/hooks';
import { trackEvent } from '../../services/analytics';
import { selectDueMeal, selectLatestScan, useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackMeals = useAppStore((state) => state.meals);
  const fallbackScans = useAppStore((state) => state.scans);
  const fallbackBilling = useAppStore((state) => state.billing);
  const setFollowupState = useAppStore((state) => state.setFollowupState);
  const fallbackProfile = useAppStore((state) => state.profile);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const historyQuery = useHistoryFeed(12);
  const insightsQuery = useInsightsData('');

  const firstPage = historyQuery.data?.pages[0];
  const meals = firstPage ? [...firstPage.pendingMeals, ...firstPage.recentMeals] : fallbackMeals;
  const scans = firstPage?.scans ?? fallbackScans;
  const billing = insightsQuery.data?.billing ?? fallbackBilling;
  const profile = insightsQuery.data?.profile ?? fallbackProfile;
  const latestScan = scans[0] ? selectLatestScan(scans, scans[0].id) : undefined;
  const dueMeal = selectDueMeal(meals);
  const bannerScan = dueMeal?.scanId ? scans.find((scan) => scan.id === dueMeal.scanId) : undefined;

  useEffect(() => {
    trackEvent('home_viewed');
    if (dueMeal) {
      trackEvent('followup_banner_viewed', { meal_id: dueMeal.id });
    }
  }, [dueMeal]);

  return (
    <AppScreen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <AvatarButton onPress={() => navigation.navigate('Settings')} />
      </View>

      {dueMeal && !bannerDismissed ? (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>
            Earlier you scanned {bannerScan?.dishName ?? dueMeal.title}. Did you eat it?
          </Text>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            Close the loop so we can learn what actually affected you.
          </Text>
          <PrimaryButton label="Yes" onPress={() => navigation.navigate('FollowUp', { mealId: dueMeal.id })} />
          <SecondaryButton
            label="No"
            onPress={() => {
              void setFollowupState(dueMeal.id, false);
            }}
          />
          <SecondaryButton
            label="Later"
            onPress={() => {
              setBannerDismissed(true);
              trackEvent('followup_banner_dismissed', { meal_id: dueMeal.id });
            }}
          />
        </SectionCard>
      ) : null}

      <ScreenHeader
        eyebrow="Scan-first"
        title="Scan a meal before you eat it."
        subtitle="We'll estimate how likely it is to trigger symptoms based on your stomach profile."
      />

      <SectionCard>
        <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 15, lineHeight: 22 }}>
          Conditions on file: {profile?.knownConditions.length ? profile.knownConditions.join(', ') : 'General digestive logic'}
        </Text>
        <PrimaryButton
          label="Take photo"
          onPress={() => navigation.navigate('ScanCapture', { sourceType: 'camera', manualMode: false })}
        />
      </SectionCard>

      <SectionCard>
        <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Subscription status</Text>
        <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
          {billing.subscriptionStatus === 'trialing'
            ? `Trial active · ${billing.tokensRemaining} scans left`
            : `${billing.tokensRemaining} scans left`}
        </Text>
      </SectionCard>

      {latestScan ? (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Latest scan</Text>
          <Gauge score={latestScan.overallRiskScore} label={latestScan.overallRiskLevel} />
          <Text style={{ color: palette.text, fontFamily: type.body.semibold, fontSize: 17 }}>{latestScan.dishName}</Text>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            {latestScan.interpretation}
          </Text>
          <SecondaryButton label="Open result" onPress={() => navigation.navigate('ScanResult', { scanId: latestScan.id, mealId: dueMeal?.id ?? createFallbackMealId(meals, latestScan.id) })} />
        </SectionCard>
      ) : (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Nothing scanned yet</Text>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            The first scan is the magic moment. History and insights will start filling in after that.
          </Text>
        </SectionCard>
      )}
    </AppScreen>
  );
}

function createFallbackMealId(meals: ReturnType<typeof useAppStore.getState>['meals'], scanId: string) {
  return meals.find((meal) => meal.scanId === scanId)?.id ?? meals[0]?.id ?? '';
}

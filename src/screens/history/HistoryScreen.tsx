import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { HistoryCard } from '../../components/cards/HistoryCard';
import { BottomSheet } from '../../components/modals/BottomSheet';
import {
  AppScreen,
  AvatarButton,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { groupHistoryMeals, useHistoryFeed } from '../../features/history/hooks';
import { trackEvent } from '../../services/analytics';
import { selectPendingMeals, useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

export function HistoryScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackMeals = useAppStore((state) => state.meals);
  const fallbackScans = useAppStore((state) => state.scans);
  const setFollowupState = useAppStore((state) => state.setFollowupState);
  const [sheetVisible, setSheetVisible] = useState(false);
  const historyQuery = useHistoryFeed();

  const pendingMeals =
    historyQuery.data?.pages[0]?.pendingMeals ??
    selectPendingMeals(fallbackMeals);
  const recentMeals = historyQuery.data
    ? historyQuery.data.pages.flatMap((page) => page.recentMeals)
    : fallbackMeals.filter((meal) => meal.followupState !== 'pending');
  const groupedRecentMeals = groupHistoryMeals(recentMeals);
  const scans = historyQuery.data
    ? Array.from(
        new Map(historyQuery.data.pages.flatMap((page) => page.scans).map((scan) => [scan.id, scan])).values(),
      )
    : fallbackScans;

  useEffect(() => {
    trackEvent('history_viewed');
  }, []);

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Timeline"
        title="History"
        subtitle="Your scans, pending follow-ups, confirmed meals, and manual entries all live here."
        rightAccessory={<AvatarButton onPress={() => navigation.navigate('Settings')} />}
      />

      <Pressable
        onPress={() => {
          setSheetVisible(true);
          trackEvent('add_meal_tapped');
        }}
      >
        <Text style={{ color: palette.primary, fontFamily: type.body.bold, fontSize: 16 }}>+ Add meal</Text>
      </Pressable>

      {pendingMeals.length ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Pending follow-ups</Text>
          {pendingMeals.map((meal) => {
            const scan = meal.scanId ? scans.find((entry) => entry.id === meal.scanId) : undefined;
            return (
              <HistoryCard
                key={meal.id}
                meal={meal}
                scan={scan}
                onOpen={() => navigation.navigate('FollowUp', { mealId: meal.id })}
                onDidEat={() => navigation.navigate('FollowUp', { mealId: meal.id })}
                onDidNotEat={() => {
                  void setFollowupState(meal.id, false);
                }}
              />
            );
          })}
        </View>
      ) : null}

      {recentMeals.length ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Recent meals</Text>
          {groupedRecentMeals.map((group) => (
            <View key={group.label} style={{ gap: spacing.sm }}>
              <Text style={{ color: palette.textMuted, fontFamily: type.body.bold, fontSize: 13, textTransform: 'uppercase' }}>
                {group.label}
              </Text>
              {group.items.map((meal) => {
                const scan = meal.scanId ? scans.find((entry) => entry.id === meal.scanId) : undefined;
                return (
                  <HistoryCard
                    key={meal.id}
                    meal={meal}
                    scan={scan}
                    onOpen={() => {
                      if (scan) {
                        navigation.navigate('ScanResult', { scanId: scan.id, mealId: meal.id });
                        return;
                      }
                      navigation.navigate('FollowUp', { mealId: meal.id });
                    }}
                  />
                );
              })}
            </View>
          ))}
          {historyQuery.hasNextPage ? (
            <SecondaryButton
              label={historyQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              onPress={() => void historyQuery.fetchNextPage()}
              disabled={historyQuery.isFetchingNextPage}
            />
          ) : null}
        </View>
      ) : (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Nothing here yet</Text>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            Your scans and meals will show up here. Once you scan or add a meal, you can come back to it and track how it actually felt.
          </Text>
        </SectionCard>
      )}

      {scans.length > 0 && recentMeals.length === 0 ? (
        <SectionCard>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            We'll start learning faster as you confirm what you actually ate and how it felt.
          </Text>
        </SectionCard>
      ) : null}

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 20 }}>Add a meal</Text>
        <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
          Log something you already ate without changing the app's scan-first identity.
        </Text>
        <PrimaryButton
          label="Take photo"
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ScanCapture', { sourceType: 'manual_photo', manualMode: true });
          }}
        />
        <SecondaryButton
          label="Upload photo"
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ScanCapture', { sourceType: 'manual_upload', manualMode: true });
          }}
        />
        <SecondaryButton
          label="Describe meal"
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ManualMeal', {});
          }}
        />
      </BottomSheet>
    </AppScreen>
  );
}

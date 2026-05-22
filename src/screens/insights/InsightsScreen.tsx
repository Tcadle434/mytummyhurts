import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { AppScreen, SectionCard, SkeletonBlock, TabScreenHeader } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectInsightBuckets, useAppStore } from '../../store/useAppStore';
import { radii, spacing, tokens, type } from '../../theme';
import { ConditionsChipRow } from './ConditionsChipRow';
import { IngredientInsightRow } from './IngredientInsightRow';
import { TriggerSymptomMatrix } from './TriggerSymptomMatrix';

export function InsightsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackInsights = useAppStore((state) => state.insights);
  const fallbackScans = useAppStore((state) => state.scans);
  const fallbackReports = useAppStore((state) => state.dailyReports);
  const authUser = useAppStore((state) => state.authUser);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const insightsQuery = useInsightsData('');

  const isWaitingForInitialRemoteData = Boolean(
    isLiveBackendConfigured &&
      authUser &&
      !insightsQuery.data &&
      (!remoteDataLoaded || initialServerSyncNeeded || serverSyncInFlight) &&
      !insightsQuery.isError,
  );
  const isWaitingForComputedData = isWaitingForInitialRemoteData || learningSyncInFlight;
  const profile = isWaitingForComputedData
    ? insightsQuery.data?.profile
    : insightsQuery.data?.profile ?? fallbackProfile;
  const insights = isWaitingForComputedData ? [] : insightsQuery.data?.insights ?? fallbackInsights;

  const buckets = selectInsightBuckets(insights);
  const triggerInsights = useMemo(
    () =>
      [...buckets.triggers]
        .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore)
        .slice(0, 5),
    [buckets.triggers],
  );
  const safeFoodInsights = useMemo(
    () =>
      [...buckets.safeFoods]
        .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore)
        .slice(0, 4),
    [buckets.safeFoods],
  );

  const conditions = profile?.knownConditions ?? [];

  useEffect(() => {
    trackEvent('insights_viewed');
  }, []);

  function openIngredient(ingredientName: string, eventName: string) {
    trackEvent(eventName, { item_name: ingredientName });
    navigation.navigate('InsightDetail', { ingredientName });
  }

  return (
    <AppScreen>
      <TabScreenHeader title="Insights" />

      <ConditionsChipRow
        conditions={conditions}
        onEdit={() => navigation.navigate('Settings')}
      />

      {!isWaitingForComputedData && insights.length > 0 ? (
        <TriggerSymptomMatrix
          insights={insights}
          scans={fallbackScans}
          reports={fallbackReports}
          onIngredientPress={(name) => openIngredient(name, 'matrix_ingredient_opened')}
        />
      ) : null}

      <SectionGroup
        title="Top triggers"
        subtitle="Foods most linked to your symptoms."
      >
        {isWaitingForComputedData ? (
          <ListSkeleton rows={3} />
        ) : triggerInsights.length ? (
          <View style={styles.listStack}>
            {triggerInsights.map((insight) => (
              <IngredientInsightRow
                key={insight.id}
                insight={insight}
                variant="trigger"
                onPress={() => openIngredient(insight.ingredientName, 'trigger_detail_viewed')}
              />
            ))}
          </View>
        ) : (
          <EmptyHint copy="Keep scanning food and logging gut reports — your top triggers will surface here as the app learns your patterns." />
        )}
      </SectionGroup>

      <SectionGroup
        title="Safe foods"
        subtitle="Foods that have looked easy on your stomach."
      >
        {isWaitingForComputedData ? (
          <ListSkeleton rows={2} />
        ) : safeFoodInsights.length ? (
          <View style={styles.listStack}>
            {safeFoodInsights.map((insight) => (
              <IngredientInsightRow
                key={insight.id}
                insight={insight}
                variant="safe"
                onPress={() => openIngredient(insight.ingredientName, 'safe_food_detail_viewed')}
              />
            ))}
          </View>
        ) : (
          <EmptyHint copy="Calm days will start filling this list once the app sees a few meals followed by symptom-free reports." />
        )}
      </SectionGroup>
    </AppScreen>
  );
}

function SectionGroup({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function EmptyHint({ copy }: { copy: string }) {
  return (
    <SectionCard>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </SectionCard>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <View style={styles.listStack}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <SkeletonBlock width={38} height={38} radius={19} />
          <View style={styles.skeletonCopy}>
            <SkeletonBlock width="62%" height={14} radius={radii.sm} />
            <SkeletonBlock width="42%" height={12} radius={radii.sm} />
          </View>
          <SkeletonBlock width={58} height={22} radius={radii.pill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  listStack: {
    gap: spacing.xs,
  },
  emptyCopy: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  skeletonRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skeletonCopy: {
    flex: 1,
    gap: 4,
  },
});

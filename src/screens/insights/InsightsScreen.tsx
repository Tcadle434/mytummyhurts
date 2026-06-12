import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { Pip } from '../../components/common/Pip';
import { AppScreen, SectionCard, SkeletonBlock, TabScreenHeader } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useInsightsData } from '../../features/insights/hooks';
import {
  buildTriggerProfileShareText,
  buildTriggerProfileViewState,
  type TriggerProfileViewState,
} from '../../features/insights/triggerProfile';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type, type PipState } from '../../theme';
import { ProfileConfidenceLevel } from '../../types/domain';
import { ConditionsChipRow } from './ConditionsChipRow';
import { STATUS_META, TriggerProfileRow } from './TriggerProfileRow';

const ROW_STAGGER_MS = 45;

export function InsightsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackInsights = useAppStore((state) => state.insights);
  const authUser = useAppStore((state) => state.authUser);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const insightsQuery = useInsightsData('');
  const hasFallbackInsights = Boolean(fallbackProfile || fallbackInsights.length);
  const [earlyExpanded, setEarlyExpanded] = useState(false);

  const isWaitingForInitialRemoteData = Boolean(
    isLiveBackendConfigured &&
      authUser &&
      !insightsQuery.data &&
      !hasFallbackInsights &&
      (!remoteDataLoaded ||
        initialServerSyncNeeded ||
        serverSyncInFlight ||
        insightsQuery.isLoading ||
        (!insightsQuery.data && insightsQuery.isFetching)) &&
      !insightsQuery.isError,
  );
  const isWaitingForComputedData = isWaitingForInitialRemoteData;
  const profile = isWaitingForComputedData
    ? insightsQuery.data?.profile
    : insightsQuery.data?.profile ?? fallbackProfile;
  const insights = useMemo(
    () => (isWaitingForComputedData ? [] : insightsQuery.data?.insights ?? fallbackInsights),
    [fallbackInsights, insightsQuery.data?.insights, isWaitingForComputedData],
  );

  const viewState = useMemo(() => buildTriggerProfileViewState(insights), [insights]);
  const conditions = profile?.knownConditions ?? [];
  const confidenceLevel = profile?.stomachProfile.metadata.profileConfidenceLevel ?? 'early';
  const reportCount = profile?.stomachProfile.metadata.reportCount ?? 0;

  useEffect(() => {
    trackEvent('trigger_profile_viewed', {
      confirmed: viewState.counts.confirmed,
      suspects: viewState.counts.suspects,
      cleared: viewState.counts.cleared,
      safe: viewState.counts.safe,
    });
    // Counts settle after the first data load; one view event per visit is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openIngredient(ingredientName: string) {
    trackEvent('trigger_detail_viewed', { item_name: ingredientName });
    navigation.navigate('InsightDetail', { ingredientName });
  }

  function openGroup(groupKey: string, label: string) {
    trackEvent('trigger_group_detail_viewed', { group_key: groupKey, label });
    navigation.navigate('InsightDetail', { groupKey });
  }

  async function shareProfile() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('trigger_profile_shared', { total_tracked: viewState.totalTracked });
    try {
      await Share.share({ message: buildTriggerProfileShareText(viewState) });
    } catch {
      // User dismissed the share sheet; nothing to do.
    }
  }

  let rowIndex = 0;

  return (
    <AppScreen>
      <TabScreenHeader title="Your Trigger Profile" />

      {isWaitingForComputedData ? (
        <HeroSkeleton />
      ) : (
        <HeroSummaryCard
          viewState={viewState}
          confidenceLevel={confidenceLevel}
          reportCount={reportCount}
          onShare={() => void shareProfile()}
        />
      )}

      <ConditionsChipRow conditions={conditions} onEdit={() => navigation.navigate('Settings')} />

      {!isWaitingForComputedData && viewState.allSeeded ? (
        <SectionCard style={styles.seedBanner}>
          <Pip state="thinking" size={44} />
          <Text style={styles.seedBannerText}>
            These suspects come straight from your answers. Daily check-ins confirm or clear each
            one with real evidence.
          </Text>
        </SectionCard>
      ) : null}

      {isWaitingForComputedData ? (
        <ListSkeleton rows={4} />
      ) : viewState.sections.length === 0 ? (
        <EmptyHint
          pipState="thinking"
          title="Your Trigger Profile starts here"
          subtitle="Scan meals and file daily check-ins — suspects, confirmed triggers, and safe foods build up on this screen."
        />
      ) : (
        viewState.sections.map((section) => (
          <View key={section.status} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View
                  style={[styles.sectionDot, { backgroundColor: STATUS_META[section.status].tone.tint }]}
                />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionTitleSpacer} />
                <Text style={styles.sectionCountText}>{section.entries.length}</Text>
              </View>
              <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
            </View>
            <View style={styles.listStack}>
              {section.entries.map((entry) => {
                const delay = ROW_STAGGER_MS * Math.min(rowIndex, 10);
                rowIndex += 1;
                return (
                  <Animated.View key={entry.insight.id} entering={FadeInUp.duration(300).delay(delay)}>
                    <TriggerProfileRow
                      insight={entry.insight}
                      status={section.status}
                      emoji={entry.kind === 'group' ? entry.group.emoji : undefined}
                      extraDetail={entry.kind === 'group' ? entry.memberSummary : undefined}
                      onPress={() =>
                        entry.kind === 'group'
                          ? openGroup(entry.group.key, entry.group.label)
                          : openIngredient(entry.insight.ingredientName)
                      }
                    />
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ))
      )}

      {!isWaitingForComputedData && viewState.earlySignals.length > 0 ? (
        <View style={styles.earlyBlock}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEarlyExpanded((current) => !current)}
            style={({ pressed }) => [styles.earlyToggle, pressed && { opacity: 0.85 }]}
          >
            <Ionicons
              name={earlyExpanded ? 'chevron-down' : 'chevron-forward'}
              size={15}
              color={palette.textMuted}
            />
            <Text style={styles.earlyToggleText}>
              {viewState.earlySignals.length} more ingredient
              {viewState.earlySignals.length === 1 ? '' : 's'} accumulating evidence
            </Text>
          </Pressable>
          {earlyExpanded ? (
            <View style={styles.earlyList}>
              {viewState.earlySignals.map((insight) => (
                <Pressable
                  key={insight.id}
                  accessibilityRole="button"
                  onPress={() => openIngredient(insight.ingredientName)}
                  style={({ pressed }) => [styles.earlyRow, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.earlyRowName}>{insight.ingredientName}</Text>
                  <Text style={styles.earlyRowMeta}>
                    {insight.positiveEvidenceCount + insight.negativeEvidenceCount} outcome
                    {insight.positiveEvidenceCount + insight.negativeEvidenceCount === 1 ? '' : 's'} so far
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

    </AppScreen>
  );
}

function HeroSummaryCard({
  viewState,
  confidenceLevel,
  reportCount,
  onShare,
}: {
  viewState: TriggerProfileViewState;
  confidenceLevel: ProfileConfidenceLevel;
  reportCount: number;
  onShare: () => void;
}) {
  const confidenceFill = confidenceLevel === 'stable' ? 3 : confidenceLevel === 'growing' ? 2 : 1;
  const confidenceCopy =
    confidenceLevel === 'stable'
      ? 'Stable — built on your check-ins'
      : confidenceLevel === 'growing'
        ? `Growing — ${reportCount} check-in${reportCount === 1 ? '' : 's'} so far`
        : 'Early — built from your answers';

  return (
    <SectionCard style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <Text style={styles.heroKicker}>What we know about your gut</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share your Trigger Profile"
          onPress={onShare}
          hitSlop={8}
          style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="share-outline" size={17} color={palette.primary} />
        </Pressable>
      </View>
      <View style={styles.heroCountsRow}>
        <HeroCount
          value={viewState.counts.confirmed}
          label="Confirmed"
          color={tokens.color.status.risk.high.tint}
        />
        <View style={styles.heroDivider} />
        <HeroCount
          value={viewState.counts.suspects}
          label="Under review"
          color={tokens.color.status.risk.medium.tint}
        />
        <View style={styles.heroDivider} />
        <HeroCount
          value={viewState.counts.cleared + viewState.counts.safe}
          label="Cleared & safe"
          color={tokens.color.status.risk.low.tint}
        />
      </View>
      <View style={styles.confidenceRow}>
        <View style={styles.confidenceSegments}>
          {[0, 1, 2].map((segment) => (
            <View
              key={segment}
              style={[
                styles.heroConfidenceSegment,
                segment < confidenceFill && { backgroundColor: palette.primary },
              ]}
            />
          ))}
        </View>
        <Text style={styles.confidenceCopy}>Profile confidence: {confidenceCopy}</Text>
      </View>
    </SectionCard>
  );
}

function HeroCount({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.heroCount}>
      <Text style={[styles.heroCountValue, { color }]}>{value}</Text>
      <Text style={styles.heroCountLabel}>{label}</Text>
    </View>
  );
}

export function EmptyHint({
  pipState,
  title,
  subtitle,
}: {
  pipState: PipState;
  title: string;
  subtitle: string;
}) {
  return (
    <SectionCard style={styles.emptyHintCard}>
      <View style={styles.emptyHintBadge}>
        <Pip state={pipState} size={48} />
      </View>
      <View style={styles.emptyHintCopy}>
        <Text style={styles.emptyHintTitle}>{title}</Text>
        <Text style={styles.emptyHintSubtitle}>{subtitle}</Text>
      </View>
    </SectionCard>
  );
}

function HeroSkeleton() {
  return (
    <SectionCard style={styles.heroCard}>
      <SkeletonBlock width="58%" height={14} radius={radii.sm} />
      <View style={styles.heroCountsRow}>
        <SkeletonBlock width={64} height={44} radius={radii.md} />
        <SkeletonBlock width={64} height={44} radius={radii.md} />
        <SkeletonBlock width={64} height={44} radius={radii.md} />
      </View>
      <SkeletonBlock width="72%" height={12} radius={radii.sm} />
    </SectionCard>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <View style={styles.listStack}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <SkeletonBlock width={40} height={40} radius={20} />
          <View style={styles.skeletonCopy}>
            <SkeletonBlock width="62%" height={14} radius={radii.sm} />
            <SkeletonBlock width="42%" height={12} radius={radii.sm} />
          </View>
          <SkeletonBlock width={64} height={22} radius={radii.pill} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroKicker: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.bold,
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sageSoft,
  },
  heroCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCount: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  heroCountValue: {
    fontFamily: type.body.bold,
    fontSize: 30,
    lineHeight: 36,
  },
  heroCountLabel: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 11,
    lineHeight: 14,
  },
  heroDivider: {
    width: 1,
    height: 34,
    backgroundColor: tokens.color.border.subtle,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confidenceSegments: {
    flexDirection: 'row',
    gap: 3,
  },
  heroConfidenceSegment: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.chart.track,
  },
  confidenceCopy: {
    flex: 1,
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  seedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  seedBannerText: {
    flex: 1,
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitleSpacer: {
    flex: 1,
  },
  sectionCountText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.bold,
    fontSize: 13,
    lineHeight: 17,
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
  emptyHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyHintBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHintCopy: {
    flex: 1,
    gap: 4,
  },
  emptyHintTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 16,
    letterSpacing: -0.2,
  },
  emptyHintSubtitle: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
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
  earlyBlock: {
    gap: spacing.xs,
  },
  earlyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  earlyToggleText: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  earlyList: {
    gap: 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
    paddingVertical: spacing.xs,
  },
  earlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  earlyRowName: {
    flexShrink: 1,
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
    textTransform: 'capitalize',
  },
  earlyRowMeta: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 11,
    lineHeight: 15,
  },
});

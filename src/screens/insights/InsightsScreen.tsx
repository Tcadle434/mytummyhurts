import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { InsightCard } from '../../components/cards/InsightCard';
import { AppScreen, InputField, SectionCard, SkeletonBlock, TabScreenHeader } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectInsightBuckets, useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type } from '../../theme';
import { DailyGutReport, IngredientInsight } from '../../types/domain';

type WindowKey = '7d' | '30d' | 'all';

const windowOptions: { id: WindowKey; label: string }[] = [
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' },
];

export function InsightsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackInsights = useAppStore((state) => state.insights);
  const fallbackConditionInsights = useAppStore((state) => state.conditionInsights);
  const fallbackDailyReports = useAppStore((state) => state.dailyReports);
  const authUser = useAppStore((state) => state.authUser);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const [search, setSearch] = useState('');
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const deferredSearch = useDeferredValue(search);
  const insightsQuery = useInsightsData(deferredSearch);
  const isWaitingForInitialRemoteData = Boolean(
    isLiveBackendConfigured &&
      authUser &&
      !insightsQuery.data &&
      (!remoteDataLoaded || initialServerSyncNeeded || serverSyncInFlight) &&
      !insightsQuery.isError,
  );
  const profile = isWaitingForInitialRemoteData
    ? insightsQuery.data?.profile
    : insightsQuery.data?.profile ?? fallbackProfile;
  const insights = isWaitingForInitialRemoteData
    ? []
    : insightsQuery.data?.insights ?? fallbackInsights;
  const conditionInsights = isWaitingForInitialRemoteData
    ? []
    : insightsQuery.data?.conditionInsights ?? fallbackConditionInsights;
  const dailyReports = isWaitingForInitialRemoteData ? [] : fallbackDailyReports;
  const gutScore = profile?.stomachProfile.metadata.gutScore;
  const buckets = selectInsightBuckets(insights);
  const triggerInsights = useMemo(
    () => [...buckets.triggers].sort((left, right) => right.combinedRiskScore - left.combinedRiskScore).slice(0, 5),
    [buckets.triggers],
  );
  const safeFoodInsights = useMemo(
    () => [...buckets.safeFoods].sort((left, right) => left.combinedRiskScore - right.combinedRiskScore).slice(0, 4),
    [buckets.safeFoods],
  );
  const declaredSensitivities = profile?.knownIngredientSensitivities ?? [];
  const toleranceImproving = useMemo(
    () =>
      insights
        .filter((insight) => insight.positiveEvidenceCount >= 2 && insight.safeScore >= insight.triggerScore)
        .sort((left, right) => right.positiveEvidenceCount - left.positiveEvidenceCount || left.combinedRiskScore - right.combinedRiskScore)
        .slice(0, 4),
    [insights],
  );
  const foodsToTestLater = useMemo(() => {
    const requested = profile?.foodsToReintroduce ?? [];
    const gentle = safeFoodInsights.map((insight) => insight.ingredientName);
    return [...new Set([...requested, ...gentle])].slice(0, 6);
  }, [profile?.foodsToReintroduce, safeFoodInsights]);
  const needsMoreData = useMemo(() => {
    const learnedNames = new Set(insights.map((insight) => normalizeToken(insight.ingredientName)));
    const pendingDeclared = declaredSensitivities.filter((item) => !learnedNames.has(normalizeToken(item)));
    const lowEvidence = insights
      .filter((insight) => insight.supportingEvidenceCount < 3)
      .map((insight) => insight.ingredientName);

    return [...new Set([...pendingDeclared, ...lowEvidence])].slice(0, 6);
  }, [declaredSensitivities, insights]);
  const chartPoints = useMemo(() => buildChartPoints(dailyReports, windowKey), [dailyReports, windowKey]);

  useEffect(() => {
    trackEvent('insights_viewed');
  }, []);

  return (
    <AppScreen>
      <TabScreenHeader title="Insights" />

      <View style={styles.segmentedRail}>
        {windowOptions.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => setWindowKey(option.id)}
            style={({ pressed }) => [styles.segmentedPill, windowKey === option.id && styles.segmentedPillSelected, pressed && { opacity: 0.82 }]}
          >
            <Text style={[styles.segmentedLabel, windowKey === option.id && styles.segmentedLabelSelected]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {isWaitingForInitialRemoteData ? (
        <GutScoreDriversSkeleton />
      ) : gutScore ? (
        <SectionCard>
          <View style={styles.scoreHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Gut Score drivers</Text>
              <Text style={styles.sectionSubtitle}>Higher is better. These are the signals moving your gut calm.</Text>
            </View>
            <View style={styles.scoreBubble}>
              <Text style={[styles.scoreBubbleValue, { color: scoreTone(gutScore.currentScore) }]}>{gutScore.currentScore}</Text>
            </View>
          </View>
          <View style={styles.driverStack}>
            {gutScore.drivers.slice(0, 3).map((driver) => (
              <View key={driver.id} style={styles.driverRow}>
                <View style={[styles.driverDot, { backgroundColor: driverImpactTone(driver.impact) }]} />
                <View style={styles.driverCopy}>
                  <Text style={styles.driverTitle}>{driver.label}</Text>
                  <Text style={styles.driverDetail}>{driver.detail}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.scoreNextAction}>{gutScore.nextAction}</Text>
        </SectionCard>
      ) : null}

      <SectionCard>
        <Text style={styles.sectionTitle}>Trigger heatmap</Text>
        <Text style={styles.sectionSubtitle}>Which items were most likely to upset your stomach.</Text>

        {triggerInsights.length ? (
          <View style={styles.heatList}>
            {triggerInsights.map((insight) => (
              <HeatRow key={insight.id} insight={insight} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyCopy}>Keep logging food and daily reports to start seeing personalized trigger patterns.</Text>
        )}

        <View style={styles.legendRow}>
          <LegendDot color={palette.high} label="High" />
          <LegendDot color={palette.medium} label="Medium" />
          <LegendDot color={palette.low} label="Low" />
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Daily Score over time</Text>
        <Text style={styles.sectionSubtitle}>Higher scores mean calmer reported gut days.</Text>
        {isWaitingForInitialRemoteData ? (
          <DailyScoreChartSkeleton />
        ) : chartPoints.length ? (
          <LineCard points={chartPoints} />
        ) : (
          <Text style={styles.emptyCopy}>Daily Scores will appear here after you log gut reports.</Text>
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Search ingredients</Text>
        <InputField value={search} placeholder="Search garlic, dairy, wheat…" onChangeText={setSearch} />
      </SectionCard>

      {insights.length ? (
        <View style={styles.listBlock}>
          <Text style={styles.listTitle}>Learned triggers</Text>
          {triggerInsights.slice(0, 3).map((insight) => (
            <Pressable
              key={insight.id}
              onPress={() => {
                trackEvent('trigger_detail_viewed', { item_name: insight.ingredientName });
                navigation.navigate('InsightDetail', { ingredientName: insight.ingredientName });
              }}
              style={({ pressed }) => [pressed && { opacity: 0.82 }]}
            >
              <InsightCard insight={insight} />
            </Pressable>
          ))}

          {safeFoodInsights.length ? <Text style={styles.listTitle}>Likely safe foods</Text> : null}
          {safeFoodInsights.map((insight) => (
            <Pressable
              key={insight.id}
              onPress={() => {
                trackEvent('safe_food_detail_viewed', { item_name: insight.ingredientName });
                navigation.navigate('InsightDetail', { ingredientName: insight.ingredientName });
              }}
              style={({ pressed }) => [pressed && { opacity: 0.82 }]}
            >
              <InsightCard insight={insight} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {declaredSensitivities.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Declared sensitivities</Text>
          <Text style={styles.sectionSubtitle}>Your starting priors. These are declared by you, not learned yet.</Text>
          <View style={styles.chipWrap}>
            {declaredSensitivities.map((item) => (
              <View key={item} style={styles.staticChip}>
                <Text style={styles.staticChipLabel}>{item}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {toleranceImproving.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Tolerance improving</Text>
          <Text style={styles.sectionSubtitle}>These foods are showing repeated no-discomfort outcomes.</Text>
          <View style={styles.chipWrap}>
            {toleranceImproving.map((item) => (
              <View key={item.id} style={styles.staticChip}>
                <Text style={styles.staticChipLabel}>{item.ingredientName}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {foodsToTestLater.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Foods to earn back</Text>
          <Text style={styles.sectionSubtitle}>When your Gut Score is calmer, these become cautious reintroduction targets.</Text>
          <View style={styles.chipWrap}>
            {foodsToTestLater.map((item) => (
              <View key={item} style={styles.staticChipMuted}>
                <Text style={styles.staticChipMutedLabel}>{item}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {needsMoreData.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Needs more data</Text>
          <Text style={styles.sectionSubtitle}>Log more daily reports before these become strong personalized signals.</Text>
          <View style={styles.chipWrap}>
            {needsMoreData.map((item) => (
              <View key={item} style={styles.staticChipMuted}>
                <Text style={styles.staticChipMutedLabel}>{item}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : null}

      {conditionInsights.length ? (
        <View style={styles.profileFootnote}>
          <Text style={styles.profileFootnoteLabel}>Per-condition learning active</Text>
          <Text style={styles.profileFootnoteValue}>
            {conditionInsights.slice(0, 2).map((entry) => `${entry.ingredientName} for ${entry.conditionName}`).join(', ')}
          </Text>
        </View>
      ) : (profile?.knownConditions.length || declaredSensitivities.length) ? (
        <View style={styles.profileFootnote}>
          <Text style={styles.profileFootnoteLabel}>Learning from</Text>
          <Text style={styles.profileFootnoteValue}>
            {[...(profile?.knownConditions ?? []), ...declaredSensitivities].slice(0, 4).join(', ')}
          </Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function HeatRow({ insight }: { insight: IngredientInsight }) {
  const score = Math.max(12, Math.min(insight.combinedRiskScore, 100));
  const level = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  const tone = level === 'High' ? palette.high : level === 'Medium' ? palette.medium : palette.low;

  return (
    <View style={styles.heatRow}>
      <Text style={styles.heatLabel}>{insight.ingredientName}</Text>
      <View style={styles.heatTrack}>
        <View style={[styles.heatFill, { width: `${score}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[styles.heatLevel, { color: tone }]}>{level}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function GutScoreDriversSkeleton() {
  return (
    <SectionCard>
      <View style={styles.scoreHeaderRow}>
        <View style={styles.skeletonTitleStack}>
          <SkeletonBlock width={168} height={28} radius={radii.sm} />
          <SkeletonBlock width={230} height={18} radius={radii.sm} />
        </View>
        <SkeletonBlock width={64} height={64} radius={32} />
      </View>
      <View style={styles.driverStack}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.driverRow}>
            <SkeletonBlock width={10} height={10} radius={5} style={styles.skeletonDriverDot} />
            <View style={styles.driverCopy}>
              <SkeletonBlock width="52%" height={18} radius={radii.sm} />
              <SkeletonBlock width="88%" height={15} radius={radii.sm} />
            </View>
          </View>
        ))}
      </View>
      <SkeletonBlock width="78%" height={18} radius={radii.sm} />
    </SectionCard>
  );
}

function DailyScoreChartSkeleton() {
  return (
    <View style={styles.chartCard}>
      <SkeletonBlock height={120} radius={radii.lg} />
      <View style={styles.chartLabels}>
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <SkeletonBlock key={item} height={12} radius={radii.sm} style={styles.skeletonChartLabel} />
        ))}
      </View>
    </View>
  );
}

function LineCard({ points }: { points: { label: string; value: number }[] }) {
  const chartWidth = 290;
  const chartHeight = 120;
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const range = Math.max(max - min, 1);
  const linePoints = points
    .map((point, index) => {
      const x = (chartWidth / Math.max(points.length - 1, 1)) * index;
      const y = chartHeight - ((point.value - min) / range) * (chartHeight - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={styles.chartCard}>
      <Svg width={chartWidth} height={chartHeight + 12}>
        {[0, 0.5, 1].map((ratio) => {
          const y = 6 + ratio * (chartHeight - 12);
          return <Path key={ratio} d={`M0 ${y} H${chartWidth}`} stroke="rgba(41,49,58,0.08)" strokeWidth="1" strokeDasharray="4 4" />;
        })}
        <Polyline points={linePoints} fill="none" stroke={palette.primary} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => {
          const x = (chartWidth / Math.max(points.length - 1, 1)) * index;
          const y = chartHeight - ((point.value - min) / range) * (chartHeight - 12) - 6;
          return <Circle key={`${point.label}-${index}`} cx={x} cy={y} r="5" fill={palette.card} stroke={palette.primary} strokeWidth="3" />;
        })}
      </Svg>
      <View style={styles.chartLabels}>
        {points.map((point) => (
          <Text key={point.label} style={styles.chartLabel}>
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function buildChartPoints(reports: DailyGutReport[], windowKey: WindowKey) {
  const now = Date.now();
  const filtered = reports.filter((report) => {
    const ageMs = now - new Date(report.updatedAt).getTime();
    if (windowKey === '7d') return ageMs <= 7 * 24 * 60 * 60 * 1000;
    if (windowKey === '30d') return ageMs <= 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  const sorted = [...filtered].sort((left, right) => new Date(left.localDate).getTime() - new Date(right.localDate).getTime());
  const recent = sorted.slice(-6);

  if (recent.length) {
    return recent.map((report) => ({
      label: new Date(`${report.localDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: report.dailyScore ?? dailyScoreFromSeverity(report.gutSeverity),
    }));
  }

  return [];
}

function scoreTone(score: number) {
  if (score >= 67) return tokens.color.status.risk.low.tint;
  if (score >= 34) return tokens.color.status.risk.medium.tint;
  return tokens.color.status.risk.high.tint;
}

function driverImpactTone(impact: 'raises' | 'lowers' | 'neutral') {
  if (impact === 'raises') return tokens.color.status.risk.low.tint;
  if (impact === 'lowers') return tokens.color.status.risk.high.tint;
  return tokens.color.text.tertiary;
}

function dailyScoreFromSeverity(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  return Math.max(0, Math.min(100, Math.round(90 - severity * 8)));
}

const styles = StyleSheet.create({
  segmentedRail: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(255,255,255,0.7)',
    gap: spacing.xs,
  },
  segmentedPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedPillSelected: {
    backgroundColor: palette.primary,
  },
  segmentedLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  segmentedLabelSelected: {
    color: palette.white,
    fontFamily: type.body.semibold,
  },
  scoreHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  skeletonTitleStack: {
    flex: 1,
    gap: spacing.xs,
  },
  scoreBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBubbleValue: {
    fontFamily: type.body.bold,
    fontSize: 24,
    letterSpacing: -0.6,
  },
  driverStack: {
    gap: spacing.sm,
  },
  driverRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  driverDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  skeletonDriverDot: {
    marginTop: 6,
  },
  driverCopy: {
    flex: 1,
    gap: 2,
  },
  driverTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
  },
  driverDetail: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  scoreNextAction: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 24,
    letterSpacing: -0.4,
  },
  sectionSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyCopy: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  heatList: {
    gap: spacing.md,
  },
  heatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heatLabel: {
    width: 72,
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 16,
    textTransform: 'capitalize',
  },
  heatTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.line,
    overflow: 'hidden',
  },
  heatFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  heatLevel: {
    width: 58,
    textAlign: 'right',
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  chartCard: {
    gap: spacing.sm,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  chartLabel: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 11,
    textAlign: 'center',
  },
  skeletonChartLabel: {
    flex: 1,
  },
  listBlock: {
    gap: spacing.sm,
  },
  listTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  staticChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.status.success.background,
  },
  staticChipLabel: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  staticChipMuted: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.surface.card.warm,
  },
  staticChipMutedLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  profileFootnote: {
    alignItems: 'center',
    gap: 4,
  },
  profileFootnoteLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  profileFootnoteValue: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    textAlign: 'center',
  },
});

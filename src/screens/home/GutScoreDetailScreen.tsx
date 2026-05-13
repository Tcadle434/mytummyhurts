import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

import { AppScreen, InfoPill, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type } from '../../theme';
import { DailyGutReport, GutScoreDriver, GutScoreState } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'GutScoreDetail'>;

const componentCopy: {
  key: keyof GutScoreState['components'];
  label: string;
  detail: string;
}[] = [
  {
    key: 'recentDailyOutcome',
    label: 'Recent daily outcome',
    detail: 'How calm your recent daily gut reports have been.',
  },
  {
    key: 'symptomFreeConsistency',
    label: 'Calm-day consistency',
    detail: 'How consistently your recent days are reported as calm.',
  },
  {
    key: 'personalizedIngredientEvidence',
    label: 'Ingredient evidence',
    detail: 'Whether repeated outcomes are making ingredients look safer or riskier.',
  },
  {
    key: 'recentFoodLoad',
    label: 'Recent food load',
    detail: 'How safely recent food logs fit your declared and learned triggers.',
  },
  {
    key: 'dataConfidence',
    label: 'Learning confidence',
    detail: 'How much report history is supporting this score.',
  },
];

export function GutScoreDetailScreen({ navigation }: Props) {
  const profile = useAppStore((state) => state.profile);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const insights = useAppStore((state) => state.insights);
  const gutScore = profile?.stomachProfile.metadata.gutScore;

  const weeklyStats = useMemo(() => buildWeeklyStats(dailyReports), [dailyReports]);
  const reintroductionFoods = profile?.foodsToReintroduce ?? [];
  const improvingFoods = useMemo(
    () =>
      insights
        .filter((insight) => insight.positiveEvidenceCount >= 2 && insight.safeScore >= insight.triggerScore)
        .sort((left, right) => right.positiveEvidenceCount - left.positiveEvidenceCount)
        .slice(0, 4),
    [insights],
  );

  useEffect(() => {
    trackEvent('gut_score_detail_viewed', {
      score: gutScore?.currentScore,
      phase: gutScore?.phase,
    });
  }, [gutScore?.currentScore, gutScore?.phase]);

  if (!gutScore) {
    return (
      <AppScreen>
        <ScreenHeader title="Gut Score" subtitle="Complete onboarding and scan your first meal to start building your score." />
        <PrimaryButton label="Back home" onPress={() => navigation.goBack()} />
      </AppScreen>
    );
  }

  const scoreTone = gutScoreTone(gutScore.currentScore);
  const trendCopy =
    gutScore.trendDelta7d < 0
      ? `Down ${Math.abs(gutScore.trendDelta7d)} this week`
      : gutScore.trendDelta7d > 0
        ? `Up ${gutScore.trendDelta7d} this week`
        : 'Stable this week';
  const recentEvent = gutScore.recentEvent;

  return (
    <AppScreen>
      <ScreenHeader title="Gut Score" subtitle="Higher is better. This is your personal gut calm trend, not a medical diagnosis." />

      <SectionCard style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.eyebrow}>Current score</Text>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: scoreTone }]}>{gutScore.currentScore}</Text>
              <Text style={styles.scoreScale}>/100</Text>
            </View>
          </View>
          <View style={styles.phaseBadge}>
            <Ionicons name={phaseIcon(gutScore.phase)} size={16} color={tokens.color.icon.accent} />
            <Text style={styles.phaseLabel}>{phaseLabel(gutScore.phase)}</Text>
          </View>
        </View>

        <GutScoreLine points={gutScore.history} tone={scoreTone} />

        <View style={styles.pillRow}>
          <InfoPill label={trendCopy} tone={gutScore.trendDirection === 'up' ? 'riskLow' : gutScore.trendDirection === 'down' ? 'riskHigh' : 'soft'} />
          <InfoPill label={`${gutScore.confidenceLevel} confidence`} tone="soft" />
        </View>
      </SectionCard>

      <SectionCard variant="info">
        <Text style={styles.sectionTitle}>How the score works</Text>
        <Text style={styles.bodyCopy}>
          The app starts with your onboarding baseline, then updates from daily gut reports matched against the foods you log.
        </Text>
        <View style={styles.ruleRow}>
          <InfoPill label="Calm reports raise" tone="riskLow" />
          <InfoPill label="Symptoms lower" tone="riskHigh" />
          <InfoPill label="More reports = confidence" tone="soft" />
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Weekly progress</Text>
        <View style={styles.metricGrid}>
          <MetricTile label="Score change" value={formatDelta(gutScore.trendDelta7d)} tone={gutScore.trendDirection} />
          <MetricTile label="Calm reports" value={String(weeklyStats.calmCount)} tone="up" />
          <MetricTile label="Reactive reports" value={String(weeklyStats.reactiveCount)} tone={weeklyStats.reactiveCount ? 'down' : 'flat'} />
          <MetricTile label="Daily reports" value={String(dailyReports.length || profile?.stomachProfile.metadata.reportCount || 0)} tone="flat" />
        </View>
        {recentEvent ? (
          <View style={styles.eventCard}>
            <Text style={styles.eventTitle}>Latest score event</Text>
            <Text style={styles.eventCopy}>{recentEvent.summary}</Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>What is moving it</Text>
        <View style={styles.componentStack}>
          {componentCopy.map((component) => (
            <ComponentRow
              key={component.key}
              label={component.label}
              detail={component.detail}
              value={gutScore.components[component.key]}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Main drivers</Text>
        <View style={styles.driverStack}>
          {gutScore.drivers.map((driver) => (
            <DriverRow key={driver.id} driver={driver} />
          ))}
        </View>
      </SectionCard>

      <SectionCard variant="warm">
        <Text style={styles.sectionTitle}>Foods to earn back</Text>
        <Text style={styles.bodyCopy}>
          Reintroduction belongs here and in Insights: once your score is high and evidence is strong, these become cautious tolerance tests.
        </Text>
        <View style={styles.chipWrap}>
          {[...new Set([...reintroductionFoods, ...improvingFoods.map((food) => food.ingredientName)])].slice(0, 6).map((food) => (
            <InfoPill key={food} label={food} tone={gutScore.phase === 'reintroduce' ? 'riskLow' : 'soft'} />
          ))}
          {!reintroductionFoods.length && !improvingFoods.length ? (
            <Text style={styles.emptyCopy}>Add favorite foods in settings, then keep logging daily reports to unlock safer testing later.</Text>
          ) : null}
        </View>
        <InfoPill
          label={gutScore.phase === 'reintroduce' ? 'Eligible for cautious testing' : 'Not ready yet'}
          tone={gutScore.phase === 'reintroduce' ? 'riskLow' : 'warm'}
        />
      </SectionCard>

      <View style={styles.actionRow}>
        <SecondaryButton label="View insights" onPress={() => navigation.navigate('MainTabs', { screen: 'Insights' })} />
        <PrimaryButton label="Scan next meal" onPress={() => navigation.navigate('ScanCapture', { sourceType: 'camera', manualMode: false })} />
      </View>
    </AppScreen>
  );
}

function buildWeeklyStats(reports: DailyGutReport[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = reports.filter((report) => new Date(report.updatedAt).getTime() >= cutoff);
  return {
    calmCount: recent.filter((report) => report.gutSeverity <= 3).length,
    reactiveCount: recent.filter((report) => report.gutSeverity >= 7).length,
  };
}

function GutScoreLine({ points, tone }: { points: GutScoreState['history']; tone: string }) {
  const chartWidth = 280;
  const chartHeight = 86;
  const safePoints = points.length ? points : [{ score: 72, createdAt: new Date().toISOString() }];
  const max = Math.max(...safePoints.map((point) => point.score), 100);
  const min = Math.min(...safePoints.map((point) => point.score), 0);
  const range = Math.max(max - min, 1);
  const linePoints = safePoints
    .map((point, index) => {
      const x = (chartWidth / Math.max(safePoints.length - 1, 1)) * index;
      const y = chartHeight - ((point.score - min) / range) * (chartHeight - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={styles.chartWrap}>
      <Svg width={chartWidth} height={chartHeight}>
        {[0, 0.5, 1].map((ratio) => {
          const y = 6 + ratio * (chartHeight - 12);
          return <Path key={ratio} d={`M0 ${y} H${chartWidth}`} stroke={tokens.color.chart.track} strokeWidth="1" />;
        })}
        <Polyline points={linePoints} fill="none" stroke={tone} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        {safePoints.map((point, index) => {
          const x = (chartWidth / Math.max(safePoints.length - 1, 1)) * index;
          const y = chartHeight - ((point.score - min) / range) * (chartHeight - 12) - 6;
          return <Circle key={`${point.createdAt}-${index}`} cx={x} cy={y} r="4" fill={palette.card} stroke={tone} strokeWidth="3" />;
        })}
      </Svg>
    </View>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: GutScoreState['trendDirection'];
}) {
  const color = tone === 'up' ? tokens.color.status.risk.low.foreground : tone === 'down' ? tokens.color.status.risk.high.foreground : tokens.color.text.primary;
  return (
    <View style={styles.metricTile}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function ComponentRow({ label, detail, value }: { label: string; detail: string; value: number }) {
  const width = `${Math.max(8, Math.min(value, 100))}%` as const;
  const color = gutScoreTone(value);

  return (
    <View style={styles.componentRow}>
      <View style={styles.componentHeader}>
        <Text style={styles.componentLabel}>{label}</Text>
        <Text style={[styles.componentValue, { color }]}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width, backgroundColor: color }]} />
      </View>
      <Text style={styles.componentDetail}>{detail}</Text>
    </View>
  );
}

function DriverRow({ driver }: { driver: GutScoreDriver }) {
  return (
    <View style={styles.driverRow}>
      <View style={[styles.driverIcon, { backgroundColor: driverBackground(driver.impact) }]}>
        <Ionicons name={driverIcon(driver.impact)} size={16} color={driverForeground(driver.impact)} />
      </View>
      <View style={styles.driverCopy}>
        <Text style={styles.driverTitle}>{driver.label}</Text>
        <Text style={styles.driverDetail}>{driver.detail}</Text>
      </View>
    </View>
  );
}

function formatDelta(delta: number) {
  if (delta < 0) return `-${Math.abs(delta)}`;
  if (delta > 0) return `+${delta}`;
  return '0';
}

function gutScoreTone(score: number) {
  if (score >= 67) return tokens.color.status.risk.low.foreground;
  if (score >= 34) return tokens.color.status.risk.medium.foreground;
  return tokens.color.status.risk.high.foreground;
}

function phaseLabel(phase: GutScoreState['phase']) {
  if (phase === 'reintroduce') return 'Reintroduce';
  if (phase === 'learn') return 'Learn';
  return 'Calm';
}

function phaseIcon(phase: GutScoreState['phase']) {
  if (phase === 'reintroduce') return 'sparkles-outline' as const;
  if (phase === 'learn') return 'analytics-outline' as const;
  return 'leaf-outline' as const;
}

function driverIcon(impact: GutScoreDriver['impact']) {
  if (impact === 'lowers') return 'arrow-down' as const;
  if (impact === 'raises') return 'arrow-up' as const;
  return 'remove' as const;
}

function driverForeground(impact: GutScoreDriver['impact']) {
  if (impact === 'lowers') return tokens.color.status.risk.high.foreground;
  if (impact === 'raises') return tokens.color.status.risk.low.foreground;
  return tokens.color.text.tertiary;
}

function driverBackground(impact: GutScoreDriver['impact']) {
  if (impact === 'lowers') return tokens.color.status.risk.high.background;
  if (impact === 'raises') return tokens.color.status.risk.low.background;
  return tokens.color.surface.card.warm;
}

const styles = StyleSheet.create({
  heroCard: {
    gap: spacing.lg,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eyebrow: {
    ...tokens.type.label.eyebrow,
    color: tokens.color.text.tertiary,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontFamily: type.body.bold,
    fontSize: 68,
    letterSpacing: -3,
    lineHeight: 74,
  },
  scoreScale: {
    ...tokens.type.title.card,
    color: tokens.color.text.tertiary,
    paddingBottom: 10,
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.status.success.background,
  },
  phaseLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.status.success.foreground,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...tokens.type.title.card,
    color: tokens.color.text.primary,
  },
  bodyCopy: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
  },
  ruleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricTile: {
    flexGrow: 1,
    minWidth: '46%',
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.warm,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  metricValue: {
    ...tokens.type.metric.value,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
  },
  eventCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    gap: spacing.xs,
  },
  eventTitle: {
    ...tokens.type.label.chip,
    color: tokens.color.text.primary,
  },
  eventCopy: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
  },
  componentStack: {
    gap: spacing.md,
  },
  componentRow: {
    gap: spacing.xs,
  },
  componentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  componentLabel: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.primary,
  },
  componentValue: {
    ...tokens.type.body.emphasis,
    fontVariant: ['tabular-nums'],
  },
  componentDetail: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
  },
  barTrack: {
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.chart.track,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  driverStack: {
    gap: spacing.md,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  driverIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCopy: {
    flex: 1,
    gap: 3,
  },
  driverTitle: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.primary,
  },
  driverDetail: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emptyCopy: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
  },
  actionRow: {
    gap: spacing.sm,
  },
  chartWrap: {
    alignItems: 'center',
  },
});

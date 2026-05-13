import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Pip } from '../../components/common/Pip';
import { SectionCard } from '../../components/common/UI';
import { palette, radii, spacing, tokens, type, type PipState } from '../../theme';

type GutScoreHomeCardProps = {
  score: number;
  trendDelta7d?: number;
  onPress: () => void;
  onInfoPress: () => void;
};

type GutScoreZone = 'low' | 'medium' | 'high';

export function GutScoreHomeCard({ score, trendDelta7d = 0, onPress, onInfoPress }: GutScoreHomeCardProps) {
  const zone = getGutScoreZone(score);
  const scoreColor = getGutScoreZoneColor(zone);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
      <SectionCard style={styles.card}>
        <View style={styles.copyColumn}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Gut Score</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="What your Gut Score means"
              hitSlop={10}
              onPress={(event) => {
                event.stopPropagation();
                onInfoPress();
              }}
              style={({ pressed }) => [styles.infoBadge, pressed && { opacity: 0.78 }]}
            >
              <Ionicons name="information-circle-outline" size={19} color={tokens.color.icon.accent} />
            </Pressable>
          </View>

          <View style={styles.scoreRow}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}</Text>
            <Text style={styles.scoreScale}>/100</Text>
          </View>
          <Text style={styles.betterText}>Higher is better</Text>
          <Text style={styles.explainerText}>Higher score = calmer gut</Text>

          <GutScoreTrendCard delta={trendDelta7d} />
        </View>

        <GutScoreVisual score={score} zone={zone} />
      </SectionCard>
    </Pressable>
  );
}

function GutScoreTrendCard({ delta }: { delta: number }) {
  const trend = getGutScoreTrend(delta);

  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendEyebrow}>Week over week</Text>
      <View style={styles.trendMetricRow}>
        <Ionicons name={trend.iconName} size={20} color={trend.color} />
        <Text style={[styles.trendMetric, { color: trend.color }]}>{trend.metric}</Text>
      </View>
      <Text style={[styles.trendLabel, { color: trend.color }]}>{trend.label}</Text>
    </View>
  );
}

function GutScoreVisual({ score, zone }: { score: number; zone: GutScoreZone }) {
  return (
    <View style={styles.visualWrap} accessible accessibilityLabel={`Gut Score ${score}, ${zone} range`}>
      <SegmentedGutScoreArc activeZone={zone} />
      <Pip state={getPipStateForScore(score)} size={116} style={styles.pipMascot} />
    </View>
  );
}

function SegmentedGutScoreArc({ activeZone }: { activeZone: GutScoreZone }) {
  const segments: { zone: GutScoreZone; start: number; end: number; color: string }[] = [
    { zone: 'low', start: -132, end: -52, color: tokens.color.status.risk.high.tint },
    { zone: 'medium', start: -40, end: 40, color: tokens.color.status.risk.medium.tint },
    { zone: 'high', start: 52, end: 132, color: tokens.color.status.risk.low.tint },
  ];

  return (
    <Svg width={162} height={148} viewBox="0 0 162 148" style={styles.arcSvg}>
      {segments.map((segment) => (
        <Path
          key={segment.zone}
          d={describeArc(81, 96, 63, segment.start, segment.end)}
          fill="none"
          stroke={segment.color}
          strokeWidth={14}
          strokeLinecap="round"
          opacity={segment.zone === activeZone ? 1 : 0.24}
        />
      ))}
    </Svg>
  );
}

function getGutScoreZone(score: number): GutScoreZone {
  if (score <= 33) return 'low';
  if (score <= 66) return 'medium';
  return 'high';
}

function getGutScoreZoneColor(zone: GutScoreZone) {
  if (zone === 'low') return tokens.color.status.risk.high.tint;
  if (zone === 'medium') return tokens.color.status.risk.medium.tint;
  return tokens.color.status.risk.low.tint;
}

function getPipStateForScore(score: number): PipState {
  const zone = getGutScoreZone(score);
  if (zone === 'low') return 'anxious';
  if (zone === 'medium') return 'base';
  return 'joy';
}

function getGutScoreTrend(delta: number) {
  if (delta < 0) {
    return {
      iconName: 'arrow-down-outline' as const,
      color: tokens.color.status.risk.high.tint,
      metric: `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'point' : 'points'}`,
      label: 'Getting worse',
    };
  }

  if (delta > 0) {
    return {
      iconName: 'arrow-up-outline' as const,
      color: tokens.color.status.risk.low.tint,
      metric: `${delta} ${delta === 1 ? 'point' : 'points'}`,
      label: 'Improving',
    };
  }

  return {
    iconName: 'remove-outline' as const,
    color: tokens.color.status.risk.medium.tint,
    metric: '0 points',
    label: 'Neutral',
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

const styles = StyleSheet.create({
  card: {
    minHeight: 224,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  copyColumn: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    ...tokens.type.title.block,
    color: tokens.color.text.primary,
  },
  infoBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  scoreValue: {
    fontFamily: type.body.bold,
    fontSize: 58,
    lineHeight: 62,
    letterSpacing: -1.2,
  },
  scoreScale: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.semibold,
    fontSize: 24,
    lineHeight: 32,
    paddingBottom: 7,
    marginLeft: 4,
  },
  betterText: {
    color: tokens.color.status.risk.low.foreground,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  explainerText: {
    maxWidth: 160,
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 15,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  trendCard: {
    alignSelf: 'flex-start',
    minWidth: 132,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.frosted,
    gap: 3,
  },
  trendEyebrow: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  trendMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  trendMetric: {
    fontFamily: type.body.bold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  trendLabel: {
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  visualWrap: {
    width: 162,
    height: 174,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  arcSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  pipMascot: {
    marginBottom: 0,
  },
});

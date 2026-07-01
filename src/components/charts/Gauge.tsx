import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { components, radii, spacing, tokens, type } from '../../theme';
import { RiskLevel } from '../../types/domain';

type GaugeProps = {
  score: number;
  label: RiskLevel;
  labelText?: string;
};

export function Gauge({ score, label, labelText }: GaugeProps) {
  const radius = 54;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * score) / 100;
  const center = 66;
  const toneColors =
    label === 'high'
      ? tokens.color.status.risk.high
      : label === 'medium'
        ? tokens.color.status.risk.medium
        : tokens.color.status.risk.low;
  const displayLabel = labelText ?? label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <View style={styles.wrap}>
      <View style={styles.chartWrap}>
        <Svg width={132} height={132}>
          <Circle cx={center} cy={center} r={radius} stroke={components.chart.track} strokeWidth={strokeWidth} fill="transparent" />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={toneColors.tint}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            fill="transparent"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
          <Circle cx={center} cy={center} r={radius - 16} fill={tokens.color.surface.frosted} />
        </Svg>
        <View style={styles.centerContent}>
          <Text style={styles.score}>{score}</Text>
        </View>
      </View>
      {/* Text on a tone background always uses the darker text-grade
          foreground — the tint is a fill color, not a text color. */}
      <View style={[styles.badge, { backgroundColor: toneColors.background }]}>
        <Text style={[styles.badgeText, { color: toneColors.foreground }]}>{displayLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  chartWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The score is a number the app stands behind, not a percentage — the
  // serif metric face owns the ring instead of a timid Jakarta 22.
  score: {
    ...tokens.type.display.metric,
    color: tokens.color.text.primary,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  badgeText: {
    fontFamily: type.body.semibold,
    fontSize: 12,
  },
});

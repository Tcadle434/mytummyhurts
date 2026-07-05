import { StyleSheet, Text, View } from 'react-native';

import { components, radii, tokens, type } from '../../theme';
import { RiskLevel } from '../../types/domain';

type RiskBarProps = {
  label: string;
  score: number;
  level: RiskLevel;
};

export function RiskBar({ label, score, level }: RiskBarProps) {
  const toneColors =
    level === 'high'
      ? tokens.color.status.risk.high
      : level === 'medium'
        ? tokens.color.status.risk.medium
        : tokens.color.status.risk.low;
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
  // Sentence case, not per-word capitalize: "Acid reflux", never "Acid Reflux".
  const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>{displayLabel}</Text>
        {/* Level word is text: the darker text-grade foreground. The tint stays on the bar fill. */}
        <Text style={[styles.level, { color: toneColors.foreground }]}>{levelLabel}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: toneColors.tint }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    flex: 1,
    color: tokens.color.text.primary,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  level: {
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: components.chart.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});

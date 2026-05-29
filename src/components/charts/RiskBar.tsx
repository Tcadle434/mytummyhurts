import { StyleSheet, Text, View } from 'react-native';

import { components, radii, tokens, type } from '../../theme';
import { RiskLevel } from '../../types/domain';

type RiskBarProps = {
  label: string;
  score: number;
  level: RiskLevel;
};

export function RiskBar({ label, score, level }: RiskBarProps) {
  const tone =
    level === 'high'
      ? components.chart.risk.high
      : level === 'medium'
        ? components.chart.risk.medium
        : components.chart.risk.low;
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <Text style={[styles.level, { color: tone }]}>{levelLabel}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: tone }]} />
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
    textTransform: 'capitalize',
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

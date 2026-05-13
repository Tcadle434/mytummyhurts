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
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: tone }]} />
      </View>
      <Text style={[styles.level, { color: tone }]}>{levelLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    width: 62,
    color: tokens.color.text.primary,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  level: {
    width: 54,
    textAlign: 'right',
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  track: {
    flex: 1,
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

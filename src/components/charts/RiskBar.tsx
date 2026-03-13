import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, type } from '../../theme';
import { RiskLevel } from '../../types/domain';

type RiskBarProps = {
  label: string;
  score: number;
  level: RiskLevel;
};

export function RiskBar({ label, score, level }: RiskBarProps) {
  const tone = level === 'high' ? palette.high : level === 'medium' ? palette.medium : palette.low;

  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.level, { color: tone }]}>{level}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${score}%`, backgroundColor: tone }]} />
      </View>
      <Text style={styles.score}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    width: 92,
    gap: 2,
  },
  label: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  level: {
    fontFamily: type.body.medium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: '#E7E2D6',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  score: {
    width: 32,
    textAlign: 'right',
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
});

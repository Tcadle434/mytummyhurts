import { StyleSheet, Text, View } from 'react-native';

import { spacing, tokens, type } from '../../theme';

type SettingsMetricRowProps = {
  label: string;
  value: string;
};

export function SettingsMetricRow({ label, value }: SettingsMetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 4,
  },
  metricLabel: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  metricValue: {
    color: tokens.color.text.primary,
    fontFamily: type.body.semibold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
});

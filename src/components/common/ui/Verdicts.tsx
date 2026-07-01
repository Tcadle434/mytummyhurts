import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

import { spacing, tokens, type } from '../../../theme';

export type VerdictToneKey = keyof typeof tokens.color.status.verdict;

export function verdictTone(key: VerdictToneKey) {
  return tokens.color.status.verdict[key];
}

/**
 * The hero numeral pattern from the Gut Score card, bottled: a serif metric
 * with an inline unit and a plain-words caption underneath. Rule 4 of the
 * design direction — every number answers its own next question inline.
 */
export function HeroMetric({
  value,
  unit,
  caption,
  color,
  align = 'flex-start',
  style,
  valueStyle,
}: {
  value: string | number;
  unit?: string;
  caption?: string;
  color?: string;
  align?: 'flex-start' | 'center';
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[{ alignItems: align }, style]}>
      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, color ? { color } : null, valueStyle]}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      {caption ? (
        <Text style={[styles.metricCaption, align === 'center' && { textAlign: 'center' }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

/**
 * Status pill in a verdict tone. Text is always the darker `foreground`
 * grade — `tint` is a fill color and fails contrast as text on the tone
 * background.
 */
export function VerdictPill({
  label,
  tone,
  size = 'md',
}: {
  label: string;
  tone: VerdictToneKey;
  size?: 'sm' | 'md';
}) {
  const colors = verdictTone(tone);
  return (
    <View style={[styles.pill, size === 'sm' && styles.pillSm, { backgroundColor: colors.background }]}>
      <View style={[styles.pillDot, { backgroundColor: colors.tint }]} />
      <Text style={[styles.pillLabel, size === 'sm' && styles.pillLabelSm, { color: colors.foreground }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A labeled segment meter for evidence progress ("2 of 3 calm days"). The
 * label carries the meaning; the segments carry the glanceability. Never
 * ship the segments without the words.
 */
export function EvidenceMeter({
  filled,
  total,
  label,
  tone,
}: {
  filled: number;
  total: number;
  label: string;
  tone: VerdictToneKey;
}) {
  const colors = verdictTone(tone);
  const segments = Math.max(1, total);
  return (
    <View
      style={styles.meterWrap}
      accessible
      accessibilityLabel={`${label}. ${Math.min(filled, segments)} of ${segments} complete.`}
    >
      <View style={styles.meterTrack}>
        {Array.from({ length: segments }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.meterSegment,
              index < filled && { backgroundColor: colors.tint },
            ]}
          />
        ))}
      </View>
      <Text style={styles.meterLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  metricValue: {
    ...tokens.type.display.metric,
    color: tokens.color.text.primary,
  },
  metricUnit: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.semibold,
    fontSize: 17,
    lineHeight: 23,
    paddingBottom: 5,
    marginLeft: 4,
  },
  metricCaption: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: tokens.color.text.secondary,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
  },
  pillSm: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    gap: 5,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillLabel: {
    fontFamily: type.body.semibold,
    fontSize: 13,
    lineHeight: 17,
  },
  pillLabelSm: {
    fontSize: 11,
    lineHeight: 14,
  },
  meterWrap: {
    gap: 5,
  },
  meterTrack: {
    flexDirection: 'row',
    gap: 4,
  },
  meterSegment: {
    flex: 1,
    maxWidth: 26,
    height: 5,
    borderRadius: 3,
    backgroundColor: tokens.color.chart.track,
  },
  meterLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: tokens.color.text.secondary,
  },
});

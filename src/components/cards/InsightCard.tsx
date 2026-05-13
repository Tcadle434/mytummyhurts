import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { IngredientInsight } from '../../types/domain';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type InsightCardProps = {
  insight: IngredientInsight;
};

export function InsightCard({ insight }: InsightCardProps) {
  const isTrigger = insight.triggerScore >= insight.safeScore || insight.combinedRiskScore >= 52;
  const tone = isTrigger ? palette.high : palette.primary;
  const badgeBackground = isTrigger ? tokens.color.status.danger.background : tokens.color.status.success.background;
  const badgeLabel = isTrigger
    ? insight.confidenceLevel === 'high'
      ? 'Learned trigger'
      : 'Possible trigger'
    : insight.confidenceLevel === 'high'
      ? 'Learned safe food'
      : 'Safer bet';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: badgeBackground }]}>
          <Ionicons name={isTrigger ? 'warning-outline' : 'leaf-outline'} size={18} color={tone} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{insight.ingredientName}</Text>
          <Text style={styles.summary} numberOfLines={2}>
            {insight.summary}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
          <Text style={[styles.badgeLabel, { color: tone }]}>{badgeLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...components.card.default,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
    textTransform: 'capitalize',
  },
  summary: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  badgeLabel: {
    fontFamily: type.body.semibold,
    fontSize: 12,
  },
});

import { StyleSheet, Text, View } from 'react-native';

import { palette, type } from '../../theme';
import { IngredientInsight } from '../../types/domain';
import { DetailRow, InfoPill, SectionCard } from '../common/UI';

type InsightCardProps = {
  insight: IngredientInsight;
  onPress?: () => void;
};

export function InsightCard({ insight }: InsightCardProps) {
  const tone = insight.triggerScore >= insight.safeScore ? 'warm' : 'soft';
  const scoreLabel =
    insight.triggerScore >= insight.safeScore ? `${insight.triggerScore} trigger score` : `${insight.safeScore} safe score`;

  return (
    <SectionCard style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{insight.ingredientName}</Text>
        <InfoPill label={`${insight.patternStrength} pattern`} tone={tone} />
      </View>
      <DetailRow label="Signal" value={scoreLabel} />
      <DetailRow
        label="Linked conditions"
        value={insight.linkedConditions.length ? insight.linkedConditions.join(', ') : 'General digestive pattern'}
      />
      <Text style={styles.summary}>{insight.summary}</Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 17,
    textTransform: 'capitalize',
  },
  summary: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
});

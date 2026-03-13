import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import { AppScreen, DetailRow, ScreenHeader, SectionCard } from '../../components/common/UI';
import { useInsightsData } from '../../features/insights/hooks';
import { useAppStore } from '../../store/useAppStore';
import { palette, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'InsightDetail'>;

export function InsightDetailScreen({ route }: Props) {
  const fallbackInsights = useAppStore((state) => state.insights);
  const insightsQuery = useInsightsData('');

  const insight = (insightsQuery.data?.insights ?? fallbackInsights).find(
    (entry) => entry.ingredientName === route.params.ingredientName,
  );

  if (!insight) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Insight" title="We couldn't find that ingredient." subtitle="Go back and try another insight." />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Ingredient detail" title={insight.ingredientName} subtitle={insight.summary} />
      <SectionCard>
        <DetailRow label="Trigger score" value={`${insight.triggerScore}`} />
        <DetailRow label="Safe score" value={`${insight.safeScore}`} />
        <DetailRow label="Pattern strength" value={insight.patternStrength} />
        <DetailRow label="Supporting evidence" value={`${insight.supportingEvidenceCount} confirmed meals`} />
        <DetailRow
          label="Linked conditions"
          value={insight.linkedConditions.length ? insight.linkedConditions.join(', ') : 'General digestive pattern'}
        />
      </SectionCard>
      <SectionCard>
        <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Where it has shown up</Text>
        <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
          Seen in {insight.supportingEvidenceCount} confirmed meals so far.
        </Text>
      </SectionCard>
    </AppScreen>
  );
}

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, ScreenHeader, SectionCard } from '../../components/common/UI';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'InsightDetail'>;

export function InsightDetailScreen({ route }: Props) {
  const fallbackInsights = useAppStore((state) => state.insights);
  const fallbackConditionInsights = useAppStore((state) => state.conditionInsights);
  const scans = useAppStore((state) => state.scans);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const insightsQuery = useInsightsData('');

  const insight = (insightsQuery.data?.insights ?? fallbackInsights).find(
    (entry) => entry.ingredientName === route.params.ingredientName,
  );
  const conditionInsights = (insightsQuery.data?.conditionInsights ?? fallbackConditionInsights).filter(
    (entry) => entry.ingredientName === route.params.ingredientName,
  );

  const examples = useMemo(() => {
    if (!insight) {
      return [];
    }

    const token = normalizeToken(insight.ingredientName);
    return scans
      .filter((scan) => (scan.scanCategory ?? 'food') === 'food')
      .map((scan) => {
        const report = scan.localDate ? dailyReports.find((entry) => entry.localDate === scan.localDate) : undefined;
        const scanTokens = [
          scan.dishName,
          ...scan.possibleTriggers,
          ...scan.structuredAnalysis.visibleIngredients.map((ingredient) => ingredient.canonicalName),
          ...scan.structuredAnalysis.inferredIngredients.map((ingredient) => ingredient.canonicalName),
        ].map(normalizeToken);

        if (!scanTokens.some((value) => value.includes(token))) {
          return null;
        }

        return {
          id: scan.id,
          mealTitle: scan.dishName,
          note: report ? severityCopy(report.gutSeverity) : 'Food logged',
          when: formatDate(scan.createdAt),
        };
      })
      .filter(Boolean)
      .slice(0, 6) as { id: string; mealTitle: string; note: string; when: string }[];
  }, [dailyReports, insight, scans]);

  if (!insight) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Insight" title="We couldn't find that ingredient." subtitle="Go back and try another insight." />
      </AppScreen>
    );
  }

  const isTrigger = insight.triggerScore >= insight.safeScore;
  const confidence = insight.confidenceLevel === 'high' ? 86 : insight.confidenceLevel === 'medium' ? 68 : 52;
  const sourceLabel = insight.sourceBreakdown.declared && insight.sourceBreakdown.personal
    ? 'Declared + learned'
    : insight.sourceBreakdown.personal
      ? 'Learned from daily reports'
      : insight.sourceBreakdown.declared
        ? 'Declared by you'
        : 'Pattern in progress';

  return (
    <AppScreen>
      <ScreenHeader title={insight.ingredientName} />

      <View style={styles.heroRow}>
        <View style={[styles.heroIcon, { backgroundColor: isTrigger ? tokens.color.status.risk.high.background : tokens.color.status.success.background }]}>
          <Text style={[styles.heroGlyph, { color: isTrigger ? palette.high : palette.primary }]}>{insight.ingredientName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={[styles.heroBadge, { backgroundColor: isTrigger ? tokens.color.status.danger.background : tokens.color.status.success.background }]}>
          <Text style={[styles.heroBadgeLabel, { color: isTrigger ? palette.high : palette.primary }]}>
            {isTrigger ? 'High impact' : 'Safer pattern'}
          </Text>
        </View>
      </View>

      <SectionCard>
        <Text style={styles.cardTitle}>{isTrigger ? 'Why it looks risky for you' : 'Why it looks gentler for you'}</Text>
        <Text style={styles.cardBody}>{insight.summary}</Text>
        <Text style={styles.supportingLabel}>{sourceLabel}</Text>
      </SectionCard>

      <SectionCard>
        <View style={styles.confidenceHeader}>
          <Text style={styles.cardTitle}>Confidence</Text>
          <Text style={styles.confidenceLabel}>{confidence}%</Text>
        </View>
        <View style={styles.confidenceTrack}>
          <View style={[styles.confidenceFill, { width: `${confidence}%`, backgroundColor: isTrigger ? palette.high : palette.primary }]} />
        </View>
        <View style={styles.metricStack}>
          <Text style={styles.metricText}>Supporting evidence: {insight.supportingEvidenceCount} daily report signal{insight.supportingEvidenceCount === 1 ? '' : 's'}</Text>
          <Text style={styles.metricText}>Reactive-day signals: {insight.negativeEvidenceCount}</Text>
          <Text style={styles.metricText}>Calm-day signals: {insight.positiveEvidenceCount}</Text>
          <Text style={styles.metricText}>Pattern strength: {insight.patternStrength}</Text>
          <Text style={styles.metricText}>
            Linked conditions: {insight.linkedConditions.length ? insight.linkedConditions.join(', ') : 'General digestive pattern'}
          </Text>
        </View>
      </SectionCard>

      {conditionInsights.length ? (
        <SectionCard>
          <Text style={styles.cardTitle}>Condition links</Text>
          <View style={styles.metricStack}>
            {conditionInsights.slice(0, 4).map((entry) => (
              <Text key={`${entry.conditionName}-${entry.id}`} style={styles.metricText}>
                {entry.conditionName}: {entry.riskScore >= 67 ? 'high' : entry.riskScore >= 45 ? 'medium' : 'low'} signal
              </Text>
            ))}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard>
        <Text style={styles.cardTitle}>Examples from your log</Text>
        {examples.length ? (
          <View style={styles.exampleList}>
            {examples.map((example) => (
              <View key={example.id} style={styles.exampleRow}>
                <View
                  style={[
                    styles.exampleDot,
                    {
                      backgroundColor: isTrigger ? tokens.color.status.risk.high.tint : tokens.color.status.risk.low.tint,
                    },
                  ]}
                />
                <View style={styles.exampleCopy}>
                  <Text style={styles.exampleTitle}>{example.mealTitle}</Text>
                  <Text style={styles.exampleMeta}>
                    {example.note}
                    {' • '}
                    {example.when}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.cardBody}>No linked foods are stored locally yet. This insight will strengthen as more foods and daily reports are logged.</Text>
        )}
      </SectionCard>

      <SectionCard>
        <Text style={styles.cardTitle}>What to try</Text>
        <Text style={styles.cardBody}>{buildSuggestion(insight.ingredientName, isTrigger)}</Text>
      </SectionCard>
    </AppScreen>
  );
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function severityCopy(value?: number) {
  if (typeof value === 'number') {
    if (value <= 3) return 'Calm day';
    if (value <= 5) return 'Neutral day';
    return 'Reactive day';
  }

  return 'Food logged';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildSuggestion(name: string, isTrigger: boolean) {
  if (!isTrigger) {
    return `${name} has looked gentler in your recent meals. Keep portions steady and pair it with foods that have also felt easy on your stomach.`;
  }

  return `Try a smaller portion of ${name} next time, or swap it for a lower-risk alternative when possible. Repeated daily reports will keep sharpening this pattern.`;
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlyph: {
    fontFamily: type.body.bold,
    fontSize: 48,
  },
  heroBadge: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  heroBadgeLabel: {
    fontFamily: type.body.semibold,
    fontSize: 18,
  },
  cardTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  cardBody: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  confidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  confidenceLabel: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 18,
  },
  confidenceTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: palette.line,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  metricStack: {
    gap: 6,
  },
  metricText: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  supportingLabel: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  exampleList: {
    gap: spacing.md,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  exampleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  exampleCopy: {
    flex: 1,
    gap: 2,
  },
  exampleTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
  exampleMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
});

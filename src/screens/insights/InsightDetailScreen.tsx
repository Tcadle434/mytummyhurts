import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RiskBar } from '../../components/charts/RiskBar';
import {
  AppScreen,
  DetailRow,
  DetailScreenHeader,
  PipAnalysisCard,
  ScreenHeader,
  SectionCard,
} from '../../components/common/UI';
import {
  buildGroupSyntheticInsight,
  groupByKey,
  groupForIngredient,
} from '../../features/insights/triggerGroups';
import {
  evidenceDetailForInsight,
  statusForInsight,
  type TriggerStatus,
} from '../../features/insights/triggerProfile';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useInsightsData } from '../../features/insights/hooks';
import { formatConditionName } from '../../utils/conditionFormat';
import { palette, spacing, tokens, type } from '../../theme';
import { RiskLevel } from '../../types/domain';
import { EmptyHint } from './InsightsScreen';
import { STATUS_META } from './TriggerProfileRow';

type Props = NativeStackScreenProps<RootStackParamList, 'InsightDetail'>;

const STATUS_HEADLINE: Record<TriggerStatus, string> = {
  confirmed: 'Confirmed trigger',
  suspect: 'Under review',
  cleared: 'Cleared',
  safe: 'Safe food',
};

export function InsightDetailScreen({ route, navigation }: Props) {
  const fallbackInsights = useAppStore((state) => state.insights);
  const fallbackConditionInsights = useAppStore((state) => state.conditionInsights);
  const scans = useAppStore((state) => state.scans);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const insightsQuery = useInsightsData('');

  const allInsights = insightsQuery.data?.insights ?? fallbackInsights;
  const group = route.params.groupKey ? groupByKey(route.params.groupKey) : null;
  const members = useMemo(
    () =>
      group
        ? allInsights.filter((entry) => groupForIngredient(entry.ingredientName)?.key === group.key)
        : [],
    [allInsights, group],
  );

  const insight = group
    ? members.length
      ? buildGroupSyntheticInsight(group, members)
      : undefined
    : allInsights.find((entry) => entry.ingredientName === route.params.ingredientName);

  const subjectNames = useMemo(
    () =>
      group
        ? new Set(members.map((member) => member.ingredientName.toLowerCase()))
        : new Set(route.params.ingredientName ? [route.params.ingredientName.toLowerCase()] : []),
    [group, members, route.params.ingredientName],
  );

  const conditionInsights = (insightsQuery.data?.conditionInsights ?? fallbackConditionInsights).filter(
    (entry) => subjectNames.has(entry.ingredientName.toLowerCase()),
  );

  const examples = useMemo(() => {
    if (!insight) {
      return [];
    }

    const tokens = group
      ? members.map((member) => normalizeToken(member.ingredientName))
      : [normalizeToken(insight.ingredientName)];
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

        if (!scanTokens.some((value) => tokens.some((token) => token && value.includes(token)))) {
          return null;
        }

        return {
          id: scan.id,
          mealTitle: scan.dishName,
          note: report ? severityCopy(report.gutSeverity) : 'Food logged',
          severity: report?.gutSeverity,
          when: formatDate(scan.createdAt),
        };
      })
      .filter(Boolean)
      .slice(0, 6) as { id: string; mealTitle: string; note: string; severity?: number; when: string }[];
  }, [dailyReports, group, insight, members, scans]);

  if (!insight) {
    return (
      <AppScreen>
        <ScreenHeader
          eyebrow="Trigger Profile"
          title="We couldn't find that ingredient."
          subtitle="Go back and try another entry."
        />
      </AppScreen>
    );
  }

  const status: TriggerStatus =
    statusForInsight(insight) ?? (insight.triggerScore >= insight.safeScore ? 'suspect' : 'safe');
  const meta = STATUS_META[status];
  const displayName = group
    ? group.label
    : insight.ingredientName.charAt(0).toUpperCase() + insight.ingredientName.slice(1);
  const confidenceFill = insight.confidenceLevel === 'high' ? 3 : insight.confidenceLevel === 'medium' ? 2 : 1;
  const hasOutcomes = insight.positiveEvidenceCount + insight.negativeEvidenceCount > 0;

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Trigger Profile" title={displayName} />

      <SectionCard style={styles.verdictCard}>
        <View style={[styles.glyph, { backgroundColor: meta.tone.background }]}>
          {group ? (
            <Text style={styles.glyphEmoji}>{group.emoji}</Text>
          ) : (
            <Text style={[styles.glyphLabel, { color: meta.tone.foreground }]}>{displayName.charAt(0)}</Text>
          )}
        </View>
        {group ? <Text style={styles.groupSubtitle}>{group.subtitle}</Text> : null}
        <View style={[styles.statusPill, { backgroundColor: meta.tone.background }]}>
          <Text style={[styles.statusPillText, { color: meta.tone.foreground }]}>
            {STATUS_HEADLINE[status]}
          </Text>
        </View>
        <Text style={styles.verdictDetail}>{evidenceDetailForInsight(insight, status)}</Text>
        <View style={styles.confidenceRow}>
          {[0, 1, 2].map((segment) => (
            <View
              key={segment}
              style={[
                styles.confidenceSegment,
                segment < confidenceFill && { backgroundColor: meta.tone.tint },
              ]}
            />
          ))}
          <Text style={styles.confidenceLabel}>{insight.confidenceLevel} confidence</Text>
        </View>
        {insight.sourceBreakdown.declared ? (
          <View style={styles.declaredBadge}>
            <Ionicons name="person" size={10} color={palette.primary} />
            <Text style={styles.declaredBadgeText}>You told us about this one</Text>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Evidence</Text>
        <View style={styles.evidenceCounts}>
          <EvidenceCount
            value={insight.negativeEvidenceCount}
            label="Rough-day data points"
            color={tokens.color.status.risk.high.foreground}
          />
          <View style={styles.evidenceDivider} />
          <EvidenceCount
            value={insight.positiveEvidenceCount}
            label="Calm-day data points"
            color={tokens.color.status.risk.low.foreground}
          />
        </View>
        {!hasOutcomes ? (
          <Text style={styles.evidenceHint}>
            No real-world outcomes yet — daily check-ins after meals with {insight.ingredientName} build this up.
          </Text>
        ) : null}
        <View style={styles.detailRows}>
          <DetailRow label="Pattern strength" value={capitalize(insight.patternStrength)} />
          {insight.lastSeenAt ? <DetailRow label="Last seen in a scan" value={formatDate(insight.lastSeenAt)} /> : null}
          {insight.lastOutcomeAt ? <DetailRow label="Last outcome logged" value={formatDate(insight.lastOutcomeAt)} /> : null}
        </View>
      </SectionCard>

      {group && members.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>In this group</Text>
          <View style={styles.memberList}>
            {[...members]
              .sort(
                (left, right) =>
                  right.positiveEvidenceCount +
                  right.negativeEvidenceCount -
                  (left.positiveEvidenceCount + left.negativeEvidenceCount),
              )
              .map((member) => {
                const outcomes = member.positiveEvidenceCount + member.negativeEvidenceCount;
                return (
                  <Text
                    key={member.id}
                    accessibilityRole="button"
                    onPress={() => navigation.push('InsightDetail', { ingredientName: member.ingredientName })}
                    style={styles.memberRow}
                    suppressHighlighting
                  >
                    <Text style={styles.memberName}>{capitalize(member.ingredientName)}</Text>
                    <Text style={styles.memberMeta}>
                      {'  '}
                      {outcomes > 0
                        ? `${member.negativeEvidenceCount} rough · ${member.positiveEvidenceCount} calm`
                        : member.sourceBreakdown.declared
                          ? 'from your profile'
                          : 'no outcomes yet'}
                    </Text>
                  </Text>
                );
              })}
          </View>
        </SectionCard>
      ) : null}

      {conditionInsights.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>How it hits your conditions</Text>
          <View style={styles.barList}>
            {conditionInsights.slice(0, 4).map((entry) => (
              <RiskBar
                key={`${entry.conditionName}-${entry.id}`}
                label={formatConditionName(entry.conditionName)}
                score={entry.riskScore}
                level={riskLevelForScore(entry.riskScore)}
              />
            ))}
          </View>
        </SectionCard>
      ) : null}

      {examples.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Seen in your meals</Text>
          <View style={styles.exampleList}>
            {examples.map((example) => (
              <View key={example.id} style={styles.exampleRow}>
                <View style={[styles.exampleDot, { backgroundColor: dotColorForSeverity(example.severity) }]} />
                <View style={styles.exampleCopy}>
                  <Text style={styles.exampleTitle} numberOfLines={1}>
                    {example.mealTitle}
                  </Text>
                  <Text style={styles.exampleMeta}>
                    {example.note} · {example.when}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : (
        <EmptyHint
          pipState="thinking"
          title="No linked meals yet"
          subtitle="Scans and check-ins referencing this ingredient will land here."
        />
      )}

      <PipAnalysisCard title="What to try" body={buildSuggestion(insight.ingredientName, status)} />
    </AppScreen>
  );
}

function EvidenceCount({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.evidenceCount}>
      <Text style={[styles.evidenceCountValue, { color }]}>{value}</Text>
      <Text style={styles.evidenceCountLabel}>{label}</Text>
    </View>
  );
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function severityCopy(value?: number) {
  if (typeof value === 'number') {
    if (value <= 3) return 'Calm day';
    if (value <= 6) return 'Neutral day';
    return 'Rough day';
  }

  return 'Food logged';
}

function dotColorForSeverity(value?: number) {
  if (typeof value !== 'number') {
    return tokens.color.chart.track;
  }
  if (value <= 3) return tokens.color.status.risk.low.tint;
  if (value <= 6) return tokens.color.status.risk.medium.tint;
  return tokens.color.status.risk.high.tint;
}

function riskLevelForScore(score: number): RiskLevel {
  if (score >= 64) return 'high';
  if (score >= 37) return 'medium';
  return 'low';
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildSuggestion(name: string, status: TriggerStatus) {
  if (status === 'confirmed') {
    return `${capitalize(name)} has real evidence behind it. Try a smaller portion or a swap when you can, and keep logging — if your gut changes, the evidence will show it.`;
  }

  if (status === 'suspect') {
    return `The case on ${name} is still open. Eat normally and keep filing daily check-ins — each one moves it toward confirmed or cleared.`;
  }

  if (status === 'cleared') {
    return `You suspected ${name}, but your calm days say it sits fine. It can stay on the menu — we'll flag it again if the pattern shifts.`;
  }

  return `${capitalize(name)} has looked gentle for you. Pairing it with your other safe foods is a good base for rough weeks.`;
}

const styles = StyleSheet.create({
  verdictCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  glyph: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLabel: {
    fontFamily: type.body.bold,
    fontSize: 30,
  },
  glyphEmoji: {
    fontSize: 34,
  },
  groupSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  memberList: {
    gap: spacing.xs,
  },
  memberRow: {
    paddingVertical: 2,
  },
  memberName: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  memberMeta: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  statusPillText: {
    fontFamily: type.body.bold,
    fontSize: 14,
    lineHeight: 18,
  },
  verdictDetail: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceSegment: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.chart.track,
  },
  confidenceLabel: {
    marginLeft: spacing.xs,
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'capitalize',
  },
  declaredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: palette.sageSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  declaredBadgeText: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 11,
    lineHeight: 15,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  evidenceCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  evidenceCount: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  evidenceCountValue: {
    fontFamily: type.body.bold,
    fontSize: 28,
    lineHeight: 34,
  },
  evidenceCountLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  evidenceDivider: {
    width: 1,
    height: 32,
    backgroundColor: tokens.color.border.subtle,
  },
  evidenceHint: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  detailRows: {
    gap: spacing.xs,
  },
  barList: {
    gap: spacing.md,
  },
  exampleList: {
    gap: spacing.sm,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exampleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  exampleCopy: {
    flex: 1,
    gap: 1,
  },
  exampleTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 19,
  },
  exampleMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});

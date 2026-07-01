import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  familyByKey,
  familyForInsight,
  groupByKey,
  groupsForInsight,
  type TrackedFoodFamily,
} from '../../features/insights/triggerGroups';
import {
  evidenceDetailForInsight,
  statusForInsight,
  statusForMembers,
  type TriggerStatus,
} from '../../features/insights/triggerProfile';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useInsightsData } from '../../features/insights/hooks';
import { formatConditionName } from '../../utils/conditionFormat';
import { palette, spacing, tokens, type } from '../../theme';
import type { IngredientInsight, RiskLevel } from '../../types/domain';
import { EmptyHint } from './InsightsScreen';
import { STATUS_META } from './TriggerProfileRow';

type Props = NativeStackScreenProps<RootStackParamList, 'InsightDetail'>;
type MealExample = { id: string; mealTitle: string; note: string; severity?: number; when: string };

const STATUS_HEADLINE: Record<TriggerStatus, string> = {
  confirmed: 'Confirmed trigger',
  suspect: 'Under review',
  watching: 'Watching',
  cleared: 'Cleared',
  safe: 'Looking safe',
};

const FAMILY_STATUS_DETAIL: Record<TriggerStatus, string> = {
  confirmed: 'At least one food in this family is a confirmed trigger — check the members below.',
  suspect: 'Rough-day evidence is building for a food in this family. Check-ins settle the case.',
  watching: 'Foods seen in your scans — paired daily check-ins decide the verdict.',
  cleared: 'Every food here has been calm each time you ate it. You can stop worrying about these.',
  safe: 'Calm so far across this family — a few more calm days each earns cleared.',
};

export function InsightDetailScreen({ route, navigation }: Props) {
  const fallbackInsights = useAppStore((state) => state.insights);
  const fallbackConditionInsights = useAppStore((state) => state.conditionInsights);
  const scans = useAppStore((state) => state.scans);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const insightsQuery = useInsightsData('');

  const allInsights = insightsQuery.data?.insights ?? fallbackInsights;
  const group = route.params.groupKey ? groupByKey(route.params.groupKey) : null;
  const family = route.params.familyKey ? familyByKey(route.params.familyKey) : null;
  const members = useMemo(
    () =>
      group
        ? allInsights.filter((entry) => groupsForInsight(entry).some((candidate) => candidate.key === group.key))
        : [],
    [allInsights, group],
  );
  const familyMembers = useMemo(
    () =>
      family
        ? allInsights.filter((entry) => familyForInsight(entry).key === family.key)
        : [],
    [allInsights, family],
  );

  const insight = group
    ? members.length
      ? buildGroupSyntheticInsight(group, members)
      : undefined
    : family
      ? undefined
      : allInsights.find((entry) => entry.ingredientName === route.params.ingredientName);

  const subjectNames = useMemo(
    () => {
      if (family) {
        return new Set(familyMembers.map((member) => member.ingredientName.toLowerCase()));
      }
      if (group) {
        return new Set(members.map((member) => member.ingredientName.toLowerCase()));
      }
      return new Set(route.params.ingredientName ? [route.params.ingredientName.toLowerCase()] : []);
    },
    [family, familyMembers, group, members, route.params.ingredientName],
  );

  const conditionInsights = (insightsQuery.data?.conditionInsights ?? fallbackConditionInsights).filter(
    (entry) => subjectNames.has(entry.ingredientName.toLowerCase()),
  );

  const examples = useMemo(() => {
    if (!family && !insight) {
      return [];
    }

    const tokens = family
      ? familyMembers.map((member) => normalizeToken(member.ingredientName))
      : group
        ? members.map((member) => normalizeToken(member.ingredientName))
        : insight
          ? [normalizeToken(insight.ingredientName)]
          : [];
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
      .slice(0, 6) as MealExample[];
  }, [dailyReports, family, familyMembers, group, insight, members, scans]);

  if (family) {
    return (
      <FamilyDetail
        family={family}
        members={familyMembers}
        conditionInsightCount={conditionInsights.length}
        examples={examples}
        onOpenIngredient={(ingredientName) => navigation.push('InsightDetail', { ingredientName })}
      />
    );
  }

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

  // A group's verdict derives from its members (same rule as the caseboard
  // list) so tapping a row never opens a detail page with a different status.
  const status: TriggerStatus = group && members.length ? statusForMembers(members) : statusForInsight(insight);
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
            <Text style={[styles.glyphLabel, { color: meta.tone.tint }]}>{displayName.charAt(0)}</Text>
          )}
        </View>
        {group ? <Text style={styles.groupSubtitle}>{group.subtitle}</Text> : null}
        <View style={[styles.statusPill, { backgroundColor: meta.tone.background }]}>
          <Text style={[styles.statusPillText, { color: meta.tone.tint }]}>
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
            label="Rough days"
            color={tokens.color.status.risk.high.tint}
          />
          <View style={styles.evidenceDivider} />
          <EvidenceCount
            value={insight.positiveEvidenceCount}
            label="Calm days"
            color={tokens.color.status.risk.low.tint}
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
                const meta =
                  outcomes > 0
                    ? `${member.negativeEvidenceCount} rough · ${member.positiveEvidenceCount} calm`
                    : member.sourceBreakdown.declared
                      ? 'from your profile'
                      : 'no outcomes yet';
                return (
                  <MemberRow
                    key={member.id}
                    name={capitalize(member.ingredientName)}
                    meta={meta}
                    onPress={() => navigation.push('InsightDetail', { ingredientName: member.ingredientName })}
                  />
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

function FamilyDetail({
  family,
  members,
  conditionInsightCount,
  examples,
  onOpenIngredient,
}: {
  family: TrackedFoodFamily;
  members: IngredientInsight[];
  conditionInsightCount: number;
  examples: MealExample[];
  onOpenIngredient: (ingredientName: string) => void;
}) {
  const evidenceCount = members.reduce(
    (total, member) =>
      total +
      Math.max(
        member.supportingEvidenceCount,
        member.positiveEvidenceCount + member.negativeEvidenceCount,
      ),
    0,
  );
  const patternLabels = [
    ...new Set(members.flatMap((member) => groupsForInsight(member).map((group) => group.label))),
  ];

  const familyStatus = statusForMembers(members);
  const familyMeta = STATUS_META[familyStatus];

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Trigger Profile" title={family.label} />

      <SectionCard style={styles.verdictCard}>
        <View style={[styles.glyph, styles.familyGlyphLarge]}>
          <Text style={styles.glyphEmoji}>{family.emoji}</Text>
        </View>
        <Text style={styles.groupSubtitle}>Food family</Text>
        <View style={[styles.statusPill, { backgroundColor: familyMeta.tone.background }]}>
          <Text style={[styles.statusPillText, { color: familyMeta.tone.tint }]}>
            {STATUS_HEADLINE[familyStatus]}
          </Text>
        </View>
        <Text style={styles.verdictDetail}>{FAMILY_STATUS_DETAIL[familyStatus]}</Text>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Coverage</Text>
        <View style={styles.evidenceCounts}>
          <EvidenceCount value={members.length} label="Foods tracked" color={palette.primary} />
          <View style={styles.evidenceDivider} />
          <EvidenceCount value={evidenceCount} label="Paired evidence days" color={tokens.color.status.risk.medium.tint} />
        </View>
        <View style={styles.detailRows}>
          <DetailRow label="Family verdict" value={STATUS_HEADLINE[familyStatus]} />
          <DetailRow
            label="Linked patterns"
            value={patternLabels.length ? patternLabels.slice(0, 3).join(', ') : 'None yet'}
          />
          {conditionInsightCount > 0 ? (
            <DetailRow label="Condition links" value={`${conditionInsightCount} ingredient-level signal${conditionInsightCount === 1 ? '' : 's'}`} />
          ) : null}
        </View>
      </SectionCard>

      {members.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Foods in this family</Text>
          <View style={styles.memberList}>
            {[...members]
              .sort((left, right) => left.ingredientName.localeCompare(right.ingredientName))
              .map((member) => {
                const outcomes = member.positiveEvidenceCount + member.negativeEvidenceCount;
                const memberPill = STATUS_META[statusForInsight(member)].pill;
                const counts =
                  outcomes > 0
                    ? `${member.negativeEvidenceCount} rough - ${member.positiveEvidenceCount} calm`
                    : member.supportingEvidenceCount > 0
                      ? `${member.supportingEvidenceCount} paired day${member.supportingEvidenceCount === 1 ? '' : 's'}`
                      : 'seen in scans';
                const meta = `${memberPill} · ${counts}`;
                return (
                  <MemberRow
                    key={member.id}
                    name={capitalize(member.ingredientName)}
                    meta={meta}
                    onPress={() => onOpenIngredient(member.ingredientName)}
                  />
                );
              })}
          </View>
        </SectionCard>
      ) : (
        <EmptyHint
          pipState="thinking"
          title="No foods in this family yet"
          subtitle="When scans map here, the foods will show up on this page."
        />
      )}

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
                    {example.note} - {example.when}
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
          subtitle="Meal examples appear here after the app has matching scan history loaded."
        />
      )}

      <PipAnalysisCard
        title="How to read this"
        body="Each food in this family carries its own verdict. The family clears only when every food in it has earned it — one suspect keeps the case open."
      />
    </AppScreen>
  );
}

function MemberRow({
  name,
  meta,
  onPress,
}: {
  name: string;
  meta: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      onPress={onPress}
    >
      <Text style={styles.memberRow} suppressHighlighting>
        <Text style={styles.memberName}>{name}</Text>
        <Text style={styles.memberMeta}>
          {'  '}
          {meta}
        </Text>
      </Text>
    </Pressable>
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

  if (status === 'watching') {
    return `The case on ${name} hasn't started yet. File a check-in on days you eat it and the evidence will begin ruling it in or out.`;
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
  familyGlyphLarge: {
    backgroundColor: palette.sageSoft,
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
  familyStatusPill: {
    borderRadius: 999,
    backgroundColor: palette.sageSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  familyStatusPillText: {
    color: palette.primary,
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

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RiskBar } from '../../components/charts/RiskBar';
import {
  AppScreen,
  DetailRow,
  DetailScreenHeader,
  EmptyState,
  EvidenceMeter,
  PipAnalysisCard,
  SectionCard,
  VerdictPill,
  verdictTone,
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
import { spacing, tokens, type } from '../../theme';
import type { IngredientInsight, RiskLevel } from '../../types/domain';
import { STATUS_LABEL } from './statusVisuals';

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
        <DetailScreenHeader eyebrow="Trigger Profile" />
        <EmptyState
          title="We couldn't find that one"
          subtitle="It may have been regrouped as new evidence came in — head back and try another entry."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    );
  }

  // A group's verdict derives from its members (same rule as the caseboard
  // list) so tapping a row never opens a detail page with a different status.
  const status: TriggerStatus = group && members.length ? statusForMembers(members) : statusForInsight(insight);
  const tone = verdictTone(status);
  const displayName = group
    ? group.label
    : insight.ingredientName.charAt(0).toUpperCase() + insight.ingredientName.slice(1);
  const confidenceFill = insight.confidenceLevel === 'high' ? 3 : insight.confidenceLevel === 'medium' ? 2 : 1;
  const hasOutcomes = insight.positiveEvidenceCount + insight.negativeEvidenceCount > 0;

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Trigger Profile" title={displayName} />

      <SectionCard style={[styles.verdictCard, { backgroundColor: tone.background }]}>
        {group ? (
          <View style={styles.glyphBubble}>
            <Text style={styles.glyphEmoji}>{group.emoji}</Text>
          </View>
        ) : null}
        {group ? (
          <Text style={[styles.groupSubtitle, { color: tone.foreground }]}>{group.subtitle}</Text>
        ) : null}
        <Text style={[styles.verdictHeadline, { color: tone.foreground }]}>
          {STATUS_HEADLINE[status]}
        </Text>
        <Text style={[styles.verdictDetail, { color: tone.foreground }]}>
          {evidenceDetailForInsight(insight, status)}
        </Text>
        {insight.sourceBreakdown.declared ? (
          <View style={styles.declaredBadge}>
            <Ionicons name="person" size={10} color={tokens.color.action.quiet.foreground} />
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
        <EvidenceMeter
          filled={confidenceFill}
          total={3}
          label={`${capitalize(insight.confidenceLevel)} confidence`}
          tone={status}
        />
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
                    status={statusForInsight(member)}
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
        <QuietHint
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
  const familyTone = verdictTone(familyStatus);

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Trigger Profile" title={family.label} />

      <SectionCard style={[styles.verdictCard, { backgroundColor: familyTone.background }]}>
        <View style={styles.glyphBubble}>
          <Text style={styles.glyphEmoji}>{family.emoji}</Text>
        </View>
        <Text style={[styles.groupSubtitle, { color: familyTone.foreground }]}>Food family</Text>
        <Text style={[styles.verdictHeadline, { color: familyTone.foreground }]}>
          {STATUS_HEADLINE[familyStatus]}
        </Text>
        <Text style={[styles.verdictDetail, { color: familyTone.foreground }]}>
          {FAMILY_STATUS_DETAIL[familyStatus]}
        </Text>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Coverage</Text>
        <View style={styles.evidenceCounts}>
          <EvidenceCount value={members.length} label="Foods tracked" color={tokens.color.accent.brand} />
          <View style={styles.evidenceDivider} />
          {/* Numerals are text: the darker text-grade foreground, never the bar-fill tint. */}
          <EvidenceCount value={evidenceCount} label="Paired evidence days" color={tokens.color.status.risk.medium.foreground} />
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
                const counts =
                  outcomes > 0
                    ? `${member.negativeEvidenceCount} rough · ${member.positiveEvidenceCount} calm`
                    : member.supportingEvidenceCount > 0
                      ? `${member.supportingEvidenceCount} paired day${member.supportingEvidenceCount === 1 ? '' : 's'}`
                      : 'seen in scans';
                return (
                  <MemberRow
                    key={member.id}
                    name={capitalize(member.ingredientName)}
                    meta={counts}
                    status={statusForInsight(member)}
                    onPress={() => onOpenIngredient(member.ingredientName)}
                  />
                );
              })}
          </View>
        </SectionCard>
      ) : (
        <QuietHint
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
                    {example.note} · {example.when}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>
      ) : (
        <QuietHint
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
  status,
  onPress,
}: {
  name: string;
  meta: string;
  status?: TriggerStatus;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status ? `${name}, ${STATUS_LABEL[status]}, ${meta}` : `${name}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.memberRow, pressed && { opacity: 0.88 }]}
    >
      <View style={styles.memberCopy}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {status ? <VerdictPill label={STATUS_LABEL[status]} tone={status} size="sm" /> : null}
      <Ionicons name="chevron-forward" size={16} color={tokens.color.icon.muted} />
    </Pressable>
  );
}

// A hushed placeholder for sections that have no data yet — the screen's
// warmth budget belongs to the "What to try" Pip card below.
function QuietHint({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <SectionCard style={styles.quietHint}>
      <View style={styles.quietHintIcon}>
        <Ionicons name="search-outline" size={18} color={tokens.color.icon.accent} />
      </View>
      <View style={styles.quietHintCopy}>
        <Text style={styles.quietHintTitle}>{title}</Text>
        <Text style={styles.quietHintSubtitle}>{subtitle}</Text>
      </View>
    </SectionCard>
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
    if (value <= 6) return 'Mixed day';
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
  glyphBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface.frosted,
  },
  glyphEmoji: {
    fontSize: 28,
  },
  groupSubtitle: {
    ...tokens.type.label.eyebrow,
    fontFamily: type.body.semibold,
    textTransform: 'uppercase',
  },
  verdictHeadline: {
    ...tokens.type.display.section,
    textAlign: 'center',
  },
  verdictDetail: {
    ...tokens.type.body.emphasis,
    textAlign: 'center',
  },
  memberList: {
    gap: spacing.xs,
  },
  memberRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  memberCopy: {
    flex: 1,
    gap: 1,
  },
  memberName: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  memberMeta: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
  },
  declaredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface.frosted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  declaredBadgeText: {
    ...tokens.type.label.tab,
    fontFamily: type.body.semibold,
    color: tokens.color.action.quiet.foreground,
  },
  sectionTitle: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
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
    ...tokens.type.metric.label,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  evidenceDivider: {
    width: 1,
    height: 32,
    backgroundColor: tokens.color.border.subtle,
  },
  evidenceHint: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
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
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  exampleMeta: {
    ...tokens.type.label.metric,
    color: tokens.color.text.secondary,
  },
  quietHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  quietHintIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.status.verdict.watching.background,
  },
  quietHintCopy: {
    flex: 1,
    gap: 2,
  },
  quietHintTitle: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  quietHintSubtitle: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  DetailScreenHeader,
  EmptyState,
  SectionCard,
  VerdictPill,
  verdictTone,
} from '../../components/common/UI';
import {
  familyByKey,
  familyForInsight,
  groupByKey,
  groupsForInsight,
} from '../../features/insights/triggerGroups';
import {
  statusForInsight,
  statusForMembers,
  type TriggerStatus,
} from '../../features/insights/triggerProfile';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { useInsightsData } from '../../features/insights/hooks';
import { spacing, tokens, type } from '../../theme';
import type { IngredientInsight } from '../../types/domain';
import {
  buildCaseSentence,
  buildDayEvidence,
  buildEvidenceSummary,
  buildNextStep,
  memberEvidenceLine,
  type CaseDayOutcome,
  type CaseSubjectKind,
} from './caseFile';
import { STATUS_LABEL } from './statusVisuals';

type Props = NativeStackScreenProps<RootStackParamList, 'InsightDetail'>;

type CaseSubject = {
  kind: CaseSubjectKind;
  label: string;
  emoji: string;
  context: string;
  members: IngredientInsight[];
};

// The case file answers one question — "should I be eating this?" — in four
// blocks: the verdict sentence, the actual days as receipts, the foods under
// the verdict (exceptions loud, sameness quiet), and one next step. Coverage
// stats, taxonomy links, and meta-explanations earned no place here.
export function InsightDetailScreen({ route, navigation }: Props) {
  const fallbackInsights = useAppStore((state) => state.insights);
  const scans = useAppStore((state) => state.scans);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const insightsQuery = useInsightsData('');

  const allInsights = insightsQuery.data?.insights ?? fallbackInsights;
  const group = route.params.groupKey ? groupByKey(route.params.groupKey) : null;
  const family = route.params.familyKey ? familyByKey(route.params.familyKey) : null;
  const ingredientName = route.params.ingredientName;

  const subject = useMemo<CaseSubject | null>(() => {
    if (family) {
      return {
        kind: 'family',
        label: family.label,
        emoji: family.emoji,
        context: 'Food family',
        members: allInsights.filter((entry) => familyForInsight(entry).key === family.key),
      };
    }
    if (group) {
      return {
        kind: 'group',
        label: group.label,
        emoji: group.emoji,
        context: group.subtitle,
        members: allInsights.filter((entry) =>
          groupsForInsight(entry).some((candidate) => candidate.key === group.key),
        ),
      };
    }
    const insight = allInsights.find((entry) => entry.ingredientName === ingredientName);
    if (!insight) return null;
    const insightFamily = familyForInsight(insight);
    return {
      kind: 'ingredient',
      label: capitalize(insight.ingredientName),
      emoji: insightFamily.emoji,
      context: insightFamily.label,
      members: [insight],
    };
  }, [allInsights, family, group, ingredientName]);

  const status: TriggerStatus = subject?.members.length
    ? statusForMembers(subject.members)
    : 'watching';

  const evidenceDays = useMemo(
    () =>
      subject
        ? buildDayEvidence({
            memberNames: subject.members.map((member) => member.ingredientName),
            scans,
            reports: dailyReports,
          })
        : [],
    [dailyReports, scans, subject],
  );

  if (!subject) {
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

  const tone = verdictTone(status);
  const showMembers = subject.kind !== 'ingredient' && subject.members.length > 1;

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Trigger Profile" title={subject.label} />

      <SectionCard style={[styles.verdictCard, { backgroundColor: tone.background }]}>
        <View style={styles.glyphBubble}>
          <Text style={styles.glyphEmoji}>{subject.emoji}</Text>
        </View>
        <Text style={[styles.verdictContext, { color: tone.foreground }]}>{subject.context}</Text>
        <VerdictPill label={STATUS_LABEL[status]} tone={status} />
        <Text style={[styles.verdictSentence, { color: tone.foreground }]}>
          {buildCaseSentence({ kind: subject.kind, status, members: subject.members })}
        </Text>
      </SectionCard>

      <SectionCard>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>The evidence</Text>
          {evidenceDays.length > 0 ? (
            <Text style={styles.sectionSummary}>{buildEvidenceSummary(evidenceDays)}</Text>
          ) : null}
        </View>
        {evidenceDays.length ? (
          <View style={styles.dayList}>
            {evidenceDays.map((day) => (
              <View
                key={day.localDate}
                style={styles.dayRow}
                accessible
                accessibilityLabel={`${day.dateLabel}, ${day.mealTitles.join(', ')}, ${OUTCOME_LABEL[day.outcome]}`}
              >
                <View style={[styles.dayDot, { backgroundColor: OUTCOME_DOT[day.outcome] }]} />
                <Text style={styles.dayDate}>{day.dateLabel}</Text>
                <Text style={styles.dayMeals} numberOfLines={1}>
                  {day.mealTitles.join(' · ')}
                </Text>
                <Text style={[styles.dayOutcome, { color: OUTCOME_COLOR[day.outcome] }]}>
                  {OUTCOME_LABEL[day.outcome]}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyEvidence}>
            No check-ins have landed on days you ate this yet — the next one starts the case.
          </Text>
        )}
      </SectionCard>

      {showMembers ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>
            {subject.kind === 'family' ? 'Foods in this family' : 'Foods in this group'}
          </Text>
          <View style={styles.memberList}>
            {sortMembersForDisplay(subject.members, status).map((member) => {
              const memberStatus = statusForInsight(member);
              const showPill = memberStatus !== status;
              return (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${capitalize(member.ingredientName)}, ${STATUS_LABEL[memberStatus]}, ${memberEvidenceLine(member)}`}
                  onPress={() =>
                    navigation.push('InsightDetail', { ingredientName: member.ingredientName })
                  }
                  style={({ pressed }) => [styles.memberRow, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.memberCopy}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {capitalize(member.ingredientName)}
                    </Text>
                    <Text style={styles.memberMeta} numberOfLines={1}>
                      {memberEvidenceLine(member)}
                    </Text>
                  </View>
                  {showPill ? (
                    <VerdictPill label={STATUS_LABEL[memberStatus]} tone={memberStatus} size="sm" />
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={tokens.color.icon.muted} />
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
      ) : null}

      <View style={styles.nextStep}>
        <Ionicons name="compass-outline" size={16} color={tokens.color.icon.accent} />
        <Text style={styles.nextStepText}>{buildNextStep(status)}</Text>
      </View>
    </AppScreen>
  );
}

// Exceptions first (a suspect inside a safe family must not hide), then by
// evidence weight, then name — the list reads most-important-first.
function sortMembersForDisplay(members: IngredientInsight[], subjectStatus: TriggerStatus) {
  return [...members].sort((left, right) => {
    const leftDiffers = statusForInsight(left) !== subjectStatus ? 1 : 0;
    const rightDiffers = statusForInsight(right) !== subjectStatus ? 1 : 0;
    if (leftDiffers !== rightDiffers) return rightDiffers - leftDiffers;
    const leftOutcomes = left.positiveEvidenceCount + left.negativeEvidenceCount;
    const rightOutcomes = right.positiveEvidenceCount + right.negativeEvidenceCount;
    if (leftOutcomes !== rightOutcomes) return rightOutcomes - leftOutcomes;
    return left.ingredientName.localeCompare(right.ingredientName);
  });
}

const OUTCOME_LABEL: Record<CaseDayOutcome, string> = {
  calm: 'calm',
  mixed: 'mixed',
  rough: 'rough',
  none: 'no check-in',
};

const OUTCOME_DOT: Record<CaseDayOutcome, string> = {
  calm: tokens.color.status.risk.low.tint,
  mixed: tokens.color.status.risk.medium.tint,
  rough: tokens.color.status.risk.high.tint,
  none: tokens.color.chart.track,
};

const OUTCOME_COLOR: Record<CaseDayOutcome, string> = {
  calm: tokens.color.status.risk.low.foreground,
  mixed: tokens.color.status.risk.medium.foreground,
  rough: tokens.color.status.risk.high.foreground,
  none: tokens.color.text.tertiary,
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    backgroundColor: tokens.color.utility.white,
  },
  glyphEmoji: {
    fontSize: 28,
  },
  verdictContext: {
    ...tokens.type.label.eyebrow,
    fontFamily: type.body.semibold,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  // The sentence IS the hero — the one finding this screen exists to deliver.
  verdictSentence: {
    ...tokens.type.display.accent,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  sectionSummary: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
    color: tokens.color.text.secondary,
  },
  dayList: {
    gap: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 24,
  },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dayDate: {
    ...tokens.type.body.small,
    fontFamily: type.body.bold,
    color: tokens.color.text.primary,
    width: 52,
  },
  dayMeals: {
    ...tokens.type.body.small,
    flex: 1,
    color: tokens.color.text.secondary,
  },
  dayOutcome: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
  },
  emptyEvidence: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
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
  nextStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  nextStepText: {
    ...tokens.type.body.small,
    flex: 1,
    color: tokens.color.text.secondary,
  },
});

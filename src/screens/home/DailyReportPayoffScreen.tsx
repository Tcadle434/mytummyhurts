import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen, DetailScreenHeader, PrimaryButton, SectionCard } from '../../components/common/UI';
import { DailyScoreRing, scoreTint } from '../../components/progress/DailyScoreRing';
import { buildReportPayoff, resolvePayoffLoading, type PayoffEvidenceChange } from '../../features/home/reportPayoff';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyReportPayoff'>;

export function DailyReportPayoffScreen({ navigation, route }: Props) {
  const localDate = route.params.localDate;
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const learningSyncSource = useAppStore((state) => state.learningSyncSource);
  const learningSyncError = useAppStore((state) => state.learningSyncError);
  const baseline = useAppStore((state) => state.reportPayoffBaseline);
  const report = useAppStore((state) => state.dailyReports.find((entry) => entry.localDate === localDate));
  const gutScore = useAppStore((state) => state.profile?.stomachProfile.metadata.gutScore ?? null);
  const insights = useAppStore((state) => state.insights);
  const clearReportPayoffBaseline = useAppStore((state) => state.clearReportPayoffBaseline);
  const [payoffRevealed, setPayoffRevealed] = useState(false);
  const payoffLoading = resolvePayoffLoading({
    revealed: payoffRevealed,
    learningSyncInFlight,
    learningSyncSource,
  });
  const triggerLearningInFlight = payoffLoading.connecting;

  const payoff = useMemo(() => {
    if (!baseline || baseline.localDate !== localDate) {
      return null;
    }
    return buildReportPayoff({ baseline, report, gutScore, insights });
  }, [baseline, gutScore, insights, localDate, report]);

  useEffect(() => {
    if (payoffLoading.revealed && !payoffRevealed) {
      setPayoffRevealed(true);
    }
  }, [payoffLoading.revealed, payoffRevealed]);

  useEffect(() => {
    trackEvent('daily_report_payoff_viewed', { local_date: localDate });
    return () => {
      clearReportPayoffBaseline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateLabel = useMemo(() => formatLocalDate(localDate), [localDate]);
  const dailyScore = report?.dailyScore ?? (report ? dailyScoreFromSeverity(report.gutSeverity) : undefined);
  const scoreTone = typeof dailyScore === 'number' ? scoreTint(dailyScore) : tokens.color.text.tertiary;
  const symptoms = report?.symptomTags?.length ? report.symptomTags : ['None'];

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <DetailScreenHeader eyebrow="Check-in saved" title={dateLabel} />

      {!report || triggerLearningInFlight ? (
        <SectionCard style={styles.centerCard}>
          <ActivityIndicator color={palette.primary} />
          <Text style={styles.connectingTitle}>
            {report ? 'Personalizing your Daily Score' : 'Saving your report'}
          </Text>
          <Text style={styles.connectingBody}>
            {report
              ? 'Checking your meals and symptoms now.'
              : 'This should only take a moment.'}
          </Text>
        </SectionCard>
      ) : (
        <>
          <SectionCard style={styles.heroCard}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>Daily Score</Text>
              <Text style={styles.heroTitle}>{dailyScoreLabel(dailyScore)}</Text>
              <Text style={styles.heroBody}>
                Based on a {report.gutSeverity}/10 symptom day for {dateLabel}.
              </Text>
              <View style={styles.scorePill}>
                <View style={[styles.scorePillDot, { backgroundColor: scoreTone }]} />
                <Text style={styles.scorePillText}>{dailyScoreTone(dailyScore)}</Text>
              </View>
            </View>
            <DailyScoreRing score={dailyScore} size={132} strokeWidth={11} />
          </SectionCard>

          <SectionCard style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.sectionTitle}>Logged symptoms</Text>
              <View style={styles.severityPill}>
                <Text style={styles.severityPillText}>{report.gutSeverity}/10</Text>
              </View>
            </View>
            <View style={styles.symptomList}>
              {symptoms.map((symptom) => (
                <View key={symptom} style={styles.symptomChip}>
                  <Text style={styles.symptomChipText}>{symptom}</Text>
                </View>
              ))}
            </View>
            {report.notes ? <Text style={styles.notesText}>{report.notes}</Text> : null}
            <Text style={styles.evidenceLine}>
              {report.evidenceQuality === 'unscanned'
                ? "Marked as a day with unscanned foods."
                : "Marked as a typical scanned day."}
            </Text>
          </SectionCard>

          {payoff && payoff.evidenceChanges.length > 0 ? (
            <SectionCard style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>What this check-in taught us</Text>
              <View style={styles.changeList}>
                {payoff.evidenceChanges.map((change) => (
                  <EvidenceChangeRow key={`${change.kind}-${change.ingredientName}`} change={change} />
                ))}
              </View>
            </SectionCard>
          ) : null}

          {triggerLearningInFlight || learningSyncError ? (
            <View style={styles.learningNote}>
              {triggerLearningInFlight ? <ActivityIndicator color={palette.primary} size="small" /> : null}
              <Text style={styles.learningNoteText}>
                {learningSyncError || 'Trigger learning is updating in the background.'}
              </Text>
            </View>
          ) : null}
        </>
      )}

      <View style={styles.actionStack}>
        <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
      </View>
    </AppScreen>
  );
}

function EvidenceChangeRow({ change }: { change: PayoffEvidenceChange }) {
  const icon =
    change.kind === 'trigger_strengthened'
      ? ('trending-up' as const)
      : change.kind === 'safe_strengthened'
        ? ('leaf-outline' as const)
        : ('eye-outline' as const);
  const color =
    change.kind === 'trigger_strengthened'
      ? tokens.color.status.risk.high.tint
      : change.kind === 'safe_strengthened'
        ? tokens.color.status.risk.low.tint
        : palette.primary;

  return (
    <View style={styles.changeRow}>
      <View style={[styles.changeIcon, { backgroundColor: tokens.color.surface.app.default }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={styles.changeDetail}>{change.detail}</Text>
    </View>
  );
}

function formatLocalDate(localDate: string) {
  const parsed = new Date(`${localDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return localDate;
  }
  return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function dailyScoreFromSeverity(gutSeverity: number) {
  return Math.max(0, Math.min(100, Math.round(90 - gutSeverity * 8)));
}

function dailyScoreLabel(score: number | undefined) {
  return typeof score === 'number' ? `${score}%` : 'Pending';
}

function dailyScoreTone(score: number | undefined) {
  if (typeof score !== 'number') return 'Score pending';
  if (score >= 67) return 'Calmer day';
  if (score >= 34) return 'Mixed day';
  return 'Reactive day';
}

const styles = StyleSheet.create({
  screenContent: {
    gap: spacing.md,
  },
  centerCard: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectingTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  connectingBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  heroKicker: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 12,
    letterSpacing: 0.6,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 44,
    lineHeight: 50,
  },
  heroBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 19,
  },
  scorePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: tokens.color.surface.app.default,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  scorePillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scorePillText: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  summaryCard: {
    gap: spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  severityPill: {
    borderRadius: 999,
    backgroundColor: tokens.color.surface.app.default,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  severityPillText: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  symptomList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  symptomChip: {
    borderRadius: radii.pill,
    backgroundColor: tokens.color.status.success.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  symptomChipText: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  notesText: {
    color: palette.text,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  evidenceLine: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  changeList: {
    gap: spacing.sm,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  changeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeDetail: {
    flex: 1,
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  learningNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.default,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  learningNoteText: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  actionStack: {
    gap: spacing.sm,
    alignItems: 'center',
  },
});

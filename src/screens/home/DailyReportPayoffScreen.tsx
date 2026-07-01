import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ComponentProps, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Pip } from '../../components/common/Pip';
import { AppScreen, DetailScreenHeader, PrimaryButton, SectionCard } from '../../components/common/UI';
import { bandForeground, pipStateForBand } from '../../components/progress/bandStyle';
import { buildReportPayoff, resolvePayoffLoading, type PayoffEvidenceChange, type ReportPayoff } from '../../features/home/reportPayoff';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing, tokens, type, type PipState } from '../../theme';
import { dailyScoreBand } from '../../utils/weeklyProgress';
import { PayoffScoreRing } from './PayoffScoreRing';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyReportPayoff'>;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const HERO_ENTER_TRANSLATE = 14;

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

  const heroOpacity = useSharedValue(0);
  const heroTranslate = useSharedValue(HERO_ENTER_TRANSLATE);

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
    if (!payoffRevealed) {
      return;
    }
    heroOpacity.value = withTiming(1, {
      duration: tokens.motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
    heroTranslate.value = withTiming(0, {
      duration: tokens.motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [heroOpacity, heroTranslate, payoffRevealed]);

  useEffect(() => {
    trackEvent('daily_report_payoff_viewed', { local_date: localDate });
    return () => {
      clearReportPayoffBaseline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heroAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslate.value }],
  }));

  const dateLabel = useMemo(() => formatLocalDate(localDate), [localDate]);
  const dailyScore = report?.dailyScore ?? (report ? dailyScoreFromSeverity(report.gutSeverity) : undefined);
  const symptoms = report?.symptomTags?.length ? report.symptomTags : ['None'];
  const gutScoreLine = buildGutScoreLine(payoff);

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <DetailScreenHeader eyebrow={`Saved for ${dateLabel}`} />

      {!report || triggerLearningInFlight ? (
        <SectionCard style={styles.centerCard}>
          <Pip state="thinking" size={84} accessibilityLabel="Pip thinking" />
          <ActivityIndicator color={palette.primary} />
          <Text style={styles.connectingTitle}>
            {report ? 'Personalizing your Daily Score' : 'Saving your check-in'}
          </Text>
          <Text style={styles.connectingBody}>
            {report
              ? 'Checking your meals and symptoms now.'
              : 'This should only take a moment.'}
          </Text>
        </SectionCard>
      ) : (
        <>
          <Animated.View style={heroAnimatedStyle}>
            <SectionCard style={styles.heroCard}>
              <Text style={styles.heroKicker}>Daily Score</Text>
              <PayoffScoreRing score={dailyScore} revealed={payoffRevealed} />
              <View style={styles.heroVerdictRow}>
                <Pip
                  state={dailyScorePipState(dailyScore)}
                  size={44}
                  accessibilityLabel={`Pip reflecting ${dailyScoreBandPhrase(dailyScore).toLowerCase()}`}
                />
                <Text style={[styles.heroVerdict, { color: dailyScoreBandColor(dailyScore) }]}>
                  {dailyScoreBandPhrase(dailyScore)}
                </Text>
              </View>
              <Text style={styles.heroCaption}>
                From your {report.gutSeverity}/10 check-in · higher = calmer
              </Text>
            </SectionCard>
          </Animated.View>

          {payoff ? (
            <SectionCard style={styles.summaryCard}>
              <Text style={styles.payoffTitle}>What this taught us</Text>
              <View style={styles.changeList}>
                {gutScoreLine ? (
                  <PayoffRow icon={gutScoreLine.icon} color={gutScoreLine.color} text={gutScoreLine.text} />
                ) : null}
                {payoff.evidenceChanges.map((change) => (
                  <EvidenceChangeRow key={`${change.kind}-${change.ingredientName}`} change={change} />
                ))}
                {payoff.evidenceChanges.length === 0 ? (
                  <Text style={styles.steadyNote}>
                    Nothing moved in your ingredient evidence this time — steady days count too.
                  </Text>
                ) : null}
              </View>
            </SectionCard>
          ) : null}

          <SectionCard style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.sectionTitle}>What you logged</Text>
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

function PayoffRow({ icon, color, text }: { icon: IoniconName; color: string; text: string }) {
  return (
    <View style={styles.changeRow}>
      <View style={styles.changeIcon}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={styles.changeDetail}>{text}</Text>
    </View>
  );
}

function EvidenceChangeRow({ change }: { change: PayoffEvidenceChange }) {
  const icon: IoniconName =
    change.kind === 'trigger_strengthened'
      ? 'trending-up'
      : change.kind === 'safe_strengthened'
        ? 'leaf-outline'
        : 'eye-outline';
  const color =
    change.kind === 'trigger_strengthened'
      ? tokens.color.status.risk.high.tint
      : change.kind === 'safe_strengthened'
        ? tokens.color.status.risk.low.tint
        : palette.primary;

  return <PayoffRow icon={icon} color={color} text={change.detail} />;
}

// The Gut Score is pillar #1 and this is the exact moment it moves — say so.
function buildGutScoreLine(payoff: ReportPayoff | null): { icon: IoniconName; color: string; text: string } | null {
  if (!payoff || payoff.gutScoreAfter === null) {
    return null;
  }

  const after = payoff.gutScoreAfter;
  const delta = payoff.gutScoreDelta;

  if (delta === null) {
    return {
      icon: 'pulse-outline',
      color: palette.primary,
      text: `Your Gut Score is now ${after}/100.`,
    };
  }
  if (delta > 0) {
    return {
      icon: 'trending-up-outline',
      color: tokens.color.status.risk.low.foreground,
      text: `Your Gut Score moved +${delta} — now ${after}/100.`,
    };
  }
  if (delta < 0) {
    return {
      icon: 'trending-down-outline',
      color: tokens.color.status.risk.high.foreground,
      text: `Your Gut Score moved ${delta} — now ${after}/100.`,
    };
  }
  return {
    icon: 'remove-outline',
    color: tokens.color.text.tertiary,
    text: `Your Gut Score held steady at ${after}/100.`,
  };
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

// Band word, color, and Pip face all derive from the shared Daily Score band
// helpers so the check-in payoff can never drift from the progress surfaces.
function dailyScoreBandPhrase(score: number | undefined) {
  if (typeof score !== 'number') return 'Score pending';
  return `A ${dailyScoreBand(score)} day`;
}

// Text-grade band color for the verdict phrase — the darker foreground tone,
// never the bar-fill tint.
function dailyScoreBandColor(score: number | undefined) {
  if (typeof score !== 'number') return tokens.color.text.tertiary;
  return bandForeground(dailyScoreBand(score));
}

function dailyScorePipState(score: number | undefined): PipState {
  if (typeof score !== 'number') return 'thinking';
  return pipStateForBand(dailyScoreBand(score));
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
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  heroKicker: {
    ...tokens.type.label.eyebrow,
    color: palette.textMuted,
    textTransform: 'uppercase',
  },
  heroVerdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroVerdict: {
    ...tokens.type.display.section,
  },
  heroCaption: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: palette.textMuted,
    textAlign: 'center',
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
  payoffTitle: {
    ...tokens.type.display.accent,
    color: palette.text,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  severityPill: {
    borderRadius: radii.pill,
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
    backgroundColor: tokens.color.status.verdict.watching.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  symptomChipText: {
    color: tokens.color.status.verdict.watching.foreground,
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
    backgroundColor: tokens.color.surface.app.default,
  },
  changeDetail: {
    ...tokens.type.body.emphasis,
    flex: 1,
    color: palette.text,
  },
  steadyNote: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
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

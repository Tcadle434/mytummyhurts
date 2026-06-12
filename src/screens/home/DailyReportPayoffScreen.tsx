import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Pip } from '../../components/common/Pip';
import { AppScreen, DetailScreenHeader, PrimaryButton, SectionCard } from '../../components/common/UI';
import { buildReportPayoff, type PayoffEvidenceChange } from '../../features/home/reportPayoff';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyReportPayoff'>;

export function DailyReportPayoffScreen({ navigation, route }: Props) {
  const localDate = route.params.localDate;
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const learningSyncError = useAppStore((state) => state.learningSyncError);
  const baseline = useAppStore((state) => state.reportPayoffBaseline);
  const report = useAppStore((state) => state.dailyReports.find((entry) => entry.localDate === localDate));
  const gutScore = useAppStore((state) => state.profile?.stomachProfile.metadata.gutScore ?? null);
  const insights = useAppStore((state) => state.insights);
  const clearReportPayoffBaseline = useAppStore((state) => state.clearReportPayoffBaseline);

  const payoff = useMemo(() => {
    if (!baseline || baseline.localDate !== localDate) {
      return null;
    }
    return buildReportPayoff({ baseline, report, gutScore, insights });
  }, [baseline, gutScore, insights, localDate, report]);

  useEffect(() => {
    trackEvent('daily_report_payoff_viewed', { local_date: localDate });
    return () => {
      clearReportPayoffBaseline();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateLabel = useMemo(() => formatLocalDate(localDate), [localDate]);
  const connecting = learningSyncInFlight;
  const scoreDelta = payoff?.gutScoreDelta;
  const deltaTone =
    typeof scoreDelta === 'number' && scoreDelta > 0
      ? styles.deltaUp
      : typeof scoreDelta === 'number' && scoreDelta < 0
        ? styles.deltaDown
        : styles.deltaFlat;

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <DetailScreenHeader eyebrow="Check-in saved" title={dateLabel} />

      {connecting ? (
        <SectionCard style={styles.centerCard}>
          <Pip state="thinking" size={96} />
          <ActivityIndicator color={palette.primary} />
          <Text style={styles.connectingTitle}>Pip is connecting the dots</Text>
          <Text style={styles.connectingBody}>
            Matching today against your scans and trigger ledger...
          </Text>
        </SectionCard>
      ) : (
        <>
          <SectionCard style={styles.centerCard}>
            <Pip state={typeof scoreDelta === 'number' && scoreDelta < 0 ? 'subtle' : 'joy'} size={88} />
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{payoff?.gutScoreAfter ?? gutScore?.currentScore ?? '—'}</Text>
              {typeof scoreDelta === 'number' && scoreDelta !== 0 ? (
                <View style={[styles.deltaPill, deltaTone]}>
                  <Ionicons
                    name={scoreDelta > 0 ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={scoreDelta > 0 ? tokens.color.status.risk.low.foreground : tokens.color.status.risk.high.foreground}
                  />
                  <Text
                    style={[
                      styles.deltaText,
                      { color: scoreDelta > 0 ? tokens.color.status.risk.low.foreground : tokens.color.status.risk.high.foreground },
                    ]}
                  >
                    {Math.abs(scoreDelta)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.scoreCaption}>Gut Score</Text>
            {typeof payoff?.dailyScore === 'number' ? (
              <Text style={styles.dailyScoreLine}>Daily Score for {dateLabel}: {payoff.dailyScore}</Text>
            ) : null}
            {learningSyncError ? <Text style={styles.catchupLine}>{learningSyncError}</Text> : null}
          </SectionCard>

          {payoff && payoff.evidenceChanges.length > 0 ? (
            <SectionCard>
              <Text style={styles.sectionTitle}>What this check-in taught us</Text>
              <View style={styles.changeList}>
                {payoff.evidenceChanges.map((change) => (
                  <EvidenceChangeRow key={`${change.kind}-${change.ingredientName}`} change={change} />
                ))}
              </View>
            </SectionCard>
          ) : null}
        </>
      )}

      <View style={styles.actionStack}>
        <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
        <Text
          accessibilityRole="button"
          onPress={() => navigation.replace('DailyGutReport', { localDate })}
          style={styles.adjustLink}
        >
          Adjust details
        </Text>
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
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreValue: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 44,
    lineHeight: 50,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  deltaUp: {
    backgroundColor: tokens.color.status.risk.low.background,
  },
  deltaDown: {
    backgroundColor: tokens.color.status.risk.high.background,
  },
  deltaFlat: {
    backgroundColor: tokens.color.surface.app.default,
  },
  deltaText: {
    fontFamily: type.body.bold,
    fontSize: 13,
    lineHeight: 16,
  },
  scoreCaption: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 17,
  },
  dailyScoreLine: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  catchupLine: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
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
  actionStack: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  adjustLink: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: spacing.xs,
  },
});

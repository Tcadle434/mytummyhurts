import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen, EmptyState, ScreenHeader, SectionCard } from '../../components/common/UI';
import { useHistoryFeed } from '../../features/history/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { components, radii, shadows, spacing, tokens, type } from '../../theme';
import { DailyGutReport } from '../../types/domain';

type MonthCursor = {
  year: number;
  month: number;
};

type CalendarCell = {
  key: string;
  localDate?: string;
  day?: number;
  isToday?: boolean;
  isFuture?: boolean;
};

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SymptomLogScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const fallbackReports = useAppStore((state) => state.dailyReports);
  const historyQuery = useHistoryFeed(20);
  const [visibleMonth, setVisibleMonth] = useState<MonthCursor>(() => currentMonthCursor());

  const reports = useMemo(() => {
    const remoteReports = historyQuery.data?.pages.flatMap((page) => page.dailyReports ?? []) ?? [];
    return mergeReports([...fallbackReports, ...remoteReports]);
  }, [fallbackReports, historyQuery.data]);

  const reportByDate = useMemo(() => new Map(reports.map((report) => [report.localDate, report])), [reports]);
  const calendarCells = useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth]);

  useEffect(() => {
    trackEvent('symptom_log_viewed', { report_count: reports.length });
  }, [reports.length]);

  function openReport(localDate: string) {
    trackEvent('daily_gut_report_opened', { entry_point: 'symptom_log', local_date: localDate });
    navigation.navigate('DailyGutReport', { localDate });
  }

  return (
    <AppScreen contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
      <ScreenHeader title="Symptoms" subtitle="Daily Score history and editable gut reports." />

      <SectionCard style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => setVisibleMonth(addMonths(visibleMonth, -1))} style={styles.monthButton}>
            <Ionicons name="chevron-back" size={18} color={tokens.color.icon.primary} />
          </Pressable>
          <Text style={styles.monthTitle}>{formatMonthTitle(visibleMonth)}</Text>
          <Pressable onPress={() => setVisibleMonth(addMonths(visibleMonth, 1))} style={styles.monthButton}>
            <Ionicons name="chevron-forward" size={18} color={tokens.color.icon.primary} />
          </Pressable>
        </View>

        <View style={styles.legendRow}>
          <LegendItem color={scoreTone(80)} label="67-100" />
          <LegendItem color={scoreTone(50)} label="34-66" />
          <LegendItem color={scoreTone(20)} label="0-33" />
        </View>

        <View style={styles.weekdayGrid}>
          {weekdayLabels.map((label) => (
            <Text key={label} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calendarCells.map((cell) => {
            const report = cell.localDate ? reportByDate.get(cell.localDate) : undefined;
            return (
              <CalendarDay
                key={cell.key}
                cell={cell}
                report={report}
                onPress={cell.localDate && !cell.isFuture ? () => openReport(cell.localDate as string) : undefined}
              />
            );
          })}
        </View>
      </SectionCard>

      <View style={styles.listHeader}>
        <Text style={styles.sectionTitle}>Logged days</Text>
        <Text style={styles.sectionMeta}>{reports.length}</Text>
      </View>

      {reports.length ? (
        <View style={styles.reportList}>
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} onPress={() => openReport(report.localDate)} />
          ))}
        </View>
      ) : (
        <EmptyState title="No symptom days yet" subtitle="Your daily gut reports will appear here as you log them." />
      )}
    </AppScreen>
  );
}

function CalendarDay({ cell, report, onPress }: { cell: CalendarCell; report?: DailyGutReport; onPress?: () => void }) {
  if (!cell.localDate || !cell.day) {
    return <View style={styles.calendarCell} />;
  }

  const filled = Boolean(report);
  const fillColor = report ? scoreTone(dailyScoreValue(report)) : tokens.color.surface.card.default;

  return (
    <View style={styles.calendarCell}>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.dayCell,
          {
            backgroundColor: fillColor,
            borderColor: filled ? fillColor : cell.isToday ? tokens.color.border.emphasis : tokens.color.border.subtle,
            opacity: cell.isFuture ? 0.42 : pressed ? 0.82 : 1,
          },
        ]}
      >
        <Text style={[styles.dayNumber, filled && styles.dayNumberFilled]}>{cell.day}</Text>
      </Pressable>
    </View>
  );
}

function ReportRow({ report, onPress }: { report: DailyGutReport; onPress: () => void }) {
  const score = dailyScoreValue(report);
  const tone = scoreTone(score);
  const symptomSummary = report.symptomTags.length ? report.symptomTags.slice(0, 3).join(', ') : 'No symptoms tagged';
  const remainingCount = Math.max(report.symptomTags.length - 3, 0);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.9 }]}>
      <View style={[styles.reportDateBadge, { backgroundColor: tone }]}>
        <Text style={styles.reportMonth}>{formatShortMonth(report.localDate)}</Text>
        <Text style={styles.reportDay}>{formatDayNumber(report.localDate)}</Text>
      </View>
      <View style={styles.reportCopy}>
        <View style={styles.reportTitleRow}>
          <Text style={styles.reportTitle}>{formatReportDate(report.localDate)}</Text>
          <View style={[styles.severityPill, { backgroundColor: scoreBackground(score) }]}>
            <Text style={[styles.severityPillText, { color: scoreForeground(score) }]}>{score}/100</Text>
          </View>
        </View>
        <Text style={styles.reportMeta} numberOfLines={1}>
          Severity {report.gutSeverity}/10 - {symptomSummary}
          {remainingCount ? ` +${remainingCount}` : ''}
        </Text>
        {report.notes ? (
          <Text style={styles.reportNotes} numberOfLines={2}>
            {report.notes}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
    </Pressable>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function mergeReports(reports: DailyGutReport[]) {
  const byDate = new Map<string, DailyGutReport>();

  for (const report of reports) {
    const existing = byDate.get(report.localDate);
    if (!existing || new Date(report.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      byDate.set(report.localDate, report);
    }
  }

  return Array.from(byDate.values()).sort((left, right) => right.localDate.localeCompare(left.localDate));
}

function currentMonthCursor(): MonthCursor {
  const today = new Date();
  return { year: today.getFullYear(), month: today.getMonth() };
}

function addMonths(cursor: MonthCursor, delta: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function buildCalendarCells(cursor: MonthCursor): CalendarCell[] {
  const firstDay = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const today = toLocalDate(new Date());
  const cells: CalendarCell[] = [];

  for (let index = 0; index < leadingBlanks; index += 1) {
    cells.push({ key: `blank-start-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const localDate = toLocalDate(new Date(cursor.year, cursor.month, day));
    cells.push({
      key: localDate,
      localDate,
      day,
      isToday: localDate === today,
      isFuture: localDate > today,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}` });
  }

  return cells;
}

function toLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? new Date().getFullYear(), (month ?? 1) - 1, day ?? 1);
}

function formatMonthTitle(cursor: MonthCursor) {
  return new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatReportDate(localDate: string) {
  return parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatShortMonth(localDate: string) {
  return parseLocalDate(localDate).toLocaleDateString(undefined, { month: 'short' });
}

function formatDayNumber(localDate: string) {
  return String(parseLocalDate(localDate).getDate());
}

function dailyScoreValue(report: DailyGutReport) {
  return report.dailyScore ?? dailyScoreFromSeverity(report.gutSeverity);
}

function dailyScoreFromSeverity(gutSeverity: number) {
  return Math.max(0, Math.min(100, Math.round(110 - gutSeverity * 11)));
}

function scoreTone(value: number) {
  if (value >= 67) return tokens.color.status.risk.low.tint;
  if (value >= 34) return tokens.color.status.risk.medium.tint;
  return tokens.color.status.risk.high.tint;
}

function scoreForeground(value: number) {
  if (value >= 67) return tokens.color.status.risk.low.foreground;
  if (value >= 34) return tokens.color.status.risk.medium.foreground;
  return tokens.color.status.risk.high.foreground;
}

function scoreBackground(value: number) {
  if (value >= 67) return tokens.color.status.risk.low.background;
  if (value >= 34) return tokens.color.status.risk.medium.background;
  return tokens.color.status.risk.high.background;
}

const styles = StyleSheet.create({
  calendarCard: {
    gap: spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  monthTitle: {
    flex: 1,
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 19,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 12,
  },
  weekdayGrid: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    color: tokens.color.text.tertiary,
    fontFamily: type.body.semibold,
    fontSize: 11,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
  },
  dayNumber: {
    color: tokens.color.text.primary,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  dayNumberFilled: {
    color: tokens.color.text.inverse,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 22,
  },
  sectionMeta: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.semibold,
    fontSize: 14,
  },
  reportList: {
    gap: spacing.sm,
  },
  reportRow: {
    ...components.card.default,
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  reportDateBadge: {
    width: 52,
    height: 58,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  reportMonth: {
    color: tokens.color.text.inverse,
    fontFamily: type.body.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  reportDay: {
    color: tokens.color.text.inverse,
    fontFamily: type.body.bold,
    fontSize: 22,
    lineHeight: 25,
  },
  reportCopy: {
    flex: 1,
    gap: 4,
  },
  reportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  reportTitle: {
    flex: 1,
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 16,
  },
  severityPill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  severityPillText: {
    fontFamily: type.body.bold,
    fontSize: 12,
  },
  reportMeta: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  reportNotes: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.regular,
    fontSize: 13,
    lineHeight: 18,
  },
});

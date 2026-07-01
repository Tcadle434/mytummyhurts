import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryCard } from '../../components/cards/HistoryCard';
import {
  AppScreen,
  EmptyState,
  SectionCard,
  SkeletonBlock,
  TabScreenHeader,
} from '../../components/common/UI';
import { bandForeground, bandTint } from '../../components/progress/bandStyle';
import { groupHistoryScans, useHistoryFeed } from '../../features/history/hooks';
import { resolveHistoryView } from '../../features/history/viewState';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { radii, shadows, spacing, tokens, type } from '../../theme';
import { DailyGutReport, ScanHistorySummary } from '../../types/domain';
import {
  DailyScoreBand,
  dailyScoreBand,
  dailyScoreValue,
  localDateFromScan,
} from '../../utils/weeklyProgress';

type HistoryFilter = 'food' | 'menu' | 'grocery';
type HistorySection = {
  title: string;
  localDate: string;
  data: ScanHistorySummary[];
};

const filters: { id: HistoryFilter; label: string }[] = [
  { id: 'food', label: 'Food' },
  { id: 'menu', label: 'Menu' },
  { id: 'grocery', label: 'Grocery' },
];

export function HistoryScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const fallbackScans = useAppStore((state) => state.scans);
  const fallbackReports = useAppStore((state) => state.dailyReports);
  const [selectedFilter, setSelectedFilter] = useState<HistoryFilter>('food');
  // Daily reports ride along so each date group can carry its day verdict.
  const historyQuery = useHistoryFeed(12, { includeDailyReports: true, scanCategory: selectedFilter });

  const remoteScans = useMemo(
    () =>
      historyQuery.data
        ? Array.from(new Map(historyQuery.data.pages.flatMap((page) => page.scans).map((scan) => [scan.id, scan])).values())
        : null,
    [historyQuery.data],
  );
  const reports = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.dailyReports ?? []) ?? fallbackReports,
    [fallbackReports, historyQuery.data],
  );
  const reportsByDate = useMemo(() => latestReportByDate(reports), [reports]);
  const { visibleScans, contentState: historyContentState } = useMemo(
    () =>
      resolveHistoryView({
        remoteScans,
        fallbackScans,
        selectedFilter,
        isPlaceholderData: historyQuery.isPlaceholderData,
        isFetching: historyQuery.isFetching,
        isLoading: historyQuery.isLoading,
        hasData: Boolean(historyQuery.data),
      }),
    [
      fallbackScans,
      historyQuery.data,
      historyQuery.isFetching,
      historyQuery.isLoading,
      historyQuery.isPlaceholderData,
      remoteScans,
      selectedFilter,
    ],
  );
  const groupedScans = useMemo(() => groupHistoryScans(visibleScans), [visibleScans]);
  const historySections = useMemo<HistorySection[]>(
    () =>
      groupedScans.map((group) => ({
        title: group.label,
        localDate: group.items[0] ? localDateFromScan(group.items[0]) : '',
        data: group.items,
      })),
    [groupedScans],
  );

  useEffect(() => {
    trackEvent('history_viewed');
  }, []);

  function openScan(scan: ScanHistorySummary) {
    navigation.navigate('ScanResult', { scanId: scan.id });
  }

  function startFirstScan() {
    navigation.navigate('ScanCapture', {
      scanCategory: selectedFilter,
      initialMode: selectedFilter === 'grocery' ? 'barcode' : selectedFilter,
    });
  }

  return (
    <AppScreen scroll={false} keyboardAvoiding={false} contentContainerStyle={styles.screenShell}>
      <SectionList
        sections={historyContentState === 'content' ? historySections : []}
        keyExtractor={(scan) => scan.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <TabScreenHeader title="Scans" />
            <HistoryFilterRail selectedFilter={selectedFilter} onSelect={setSelectedFilter} />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <DayGroupHeader title={section.title} report={reportsByDate.get(section.localDate)} />
        )}
        renderItem={({ item }) => (
          <HistoryCard
            scan={item}
            onOpen={() => openScan(item)}
          />
        )}
        SectionSeparatorComponent={() => <View style={styles.groupGap} />}
        ItemSeparatorComponent={() => <View style={styles.itemGap} />}
        ListFooterComponent={
          historyContentState === 'skeleton' ? (
            <HistorySkeletonList />
          ) : historyContentState === 'empty' ? (
            <EmptyState
              title="Nothing here yet"
              subtitle={emptyCopy(selectedFilter)}
              actionLabel={emptyActionLabel(selectedFilter)}
              onAction={startFirstScan}
            />
          ) : historyQuery.hasNextPage ? (
            <Pressable
              onPress={() => void historyQuery.fetchNextPage()}
              disabled={historyQuery.isFetchingNextPage}
              style={({ pressed }) => [styles.loadMoreButton, (pressed || historyQuery.isFetchingNextPage) && { opacity: 0.82 }]}
            >
              <Text style={styles.loadMoreLabel}>{historyQuery.isFetchingNextPage ? 'Loading more...' : 'Load more'}</Text>
            </Pressable>
          ) : null
        }
      />
    </AppScreen>
  );
}

/**
 * A date group header that speaks the day's verdict: the label stays chrome,
 * the band word + tone dot turn the scan list into evidence under a story.
 */
function DayGroupHeader({ title, report }: { title: string; report?: DailyGutReport }) {
  const score = report ? dailyScoreValue(report) : undefined;
  const band: DailyScoreBand | undefined = score !== undefined ? dailyScoreBand(score) : undefined;

  return (
    <View
      style={styles.groupHeader}
      accessible
      accessibilityRole="header"
      accessibilityLabel={band ? `${title}, ${band} day` : title}
    >
      <Text style={styles.groupLabel}>{title}</Text>
      {band ? (
        <View style={styles.groupBand}>
          <View style={[styles.groupBandDot, { backgroundColor: bandTint(band) }]} />
          <Text style={[styles.groupBandText, { color: bandForeground(band) }]}>{band} day</Text>
        </View>
      ) : null}
    </View>
  );
}

function latestReportByDate(reports: DailyGutReport[]) {
  const byDate = new Map<string, DailyGutReport>();

  for (const report of reports) {
    const existing = byDate.get(report.localDate);
    const isNewer =
      !existing || new Date(report.updatedAt).getTime() >= new Date(existing.updatedAt).getTime();
    if (isNewer) {
      byDate.set(report.localDate, report);
    }
  }

  return byDate;
}

function HistoryFilterRail({
  selectedFilter,
  onSelect,
}: {
  selectedFilter: HistoryFilter;
  onSelect: (filter: HistoryFilter) => void;
}) {
  return (
    <View style={styles.filterRail}>
      {filters.map((filter) => (
        <Pressable
          key={filter.id}
          accessibilityRole="button"
          accessibilityLabel={`Show ${filter.label.toLowerCase()} scans`}
          accessibilityState={{ selected: selectedFilter === filter.id }}
          onPress={() => onSelect(filter.id)}
          style={({ pressed }) => [
            styles.filterChip,
            selectedFilter === filter.id && styles.filterChipSelected,
            pressed && { opacity: 0.82 },
          ]}
        >
          <Text style={[styles.filterChipText, selectedFilter === filter.id && styles.filterChipTextSelected]}>{filter.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}


function emptyCopy(filter: HistoryFilter) {
  if (filter === 'menu') {
    return 'Scan a restaurant menu to see the best and worst options for your gut.';
  }

  if (filter === 'grocery') {
    return 'Scan a packaged food barcode to check the ingredients against your gut profile.';
  }

  return 'Take a photo or upload one to start building your food log.';
}

function emptyActionLabel(filter: HistoryFilter) {
  if (filter === 'menu') return 'Scan a menu';
  if (filter === 'grocery') return 'Scan a barcode';
  return 'Scan your first meal';
}

function HistorySkeletonList() {
  return (
    <View style={styles.sectionBlock}>
      {Array.from({ length: 4 }).map((_, index) => (
        <HistoryCardSkeleton key={index} />
      ))}
    </View>
  );
}

function HistoryCardSkeleton() {
  return (
    <SectionCard style={styles.historyCardSkeleton}>
      <View style={styles.historyCardSkeletonRow}>
        <SkeletonBlock width={44} height={44} radius={22} />
        <View style={styles.historyCardSkeletonCopy}>
          <SkeletonBlock width="72%" height={18} radius={radii.sm} />
          <SkeletonBlock width="54%" height={13} radius={radii.sm} />
        </View>
        <SkeletonBlock width={72} height={26} radius={radii.pill} />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  screenShell: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    gap: 0,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  headerBlock: {
    gap: spacing.lg,
  },
  filterRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: 4,
    backgroundColor: tokens.color.surface.frosted,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  filterChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    ...shadows.card,
  },
  filterChipText: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.secondary,
  },
  filterChipTextSelected: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  sectionBlock: {
    gap: spacing.md,
  },
  itemGap: {
    height: spacing.sm,
  },
  groupGap: {
    height: spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  groupLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.bold,
    color: tokens.color.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  groupBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  groupBandDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  groupBandText: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
  },
  historyCardSkeleton: {
    padding: spacing.md,
  },
  historyCardSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  historyCardSkeletonCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  loadMoreButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.frosted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreLabel: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
});

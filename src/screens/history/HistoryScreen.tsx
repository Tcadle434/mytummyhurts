import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryCard } from '../../components/cards/HistoryCard';
import { EmptyState, SectionCard, SkeletonBlock, TabScreenHeader } from '../../components/common/UI';
import { groupHistoryScans, useHistoryFeed } from '../../features/history/hooks';
import { resolveHistoryView } from '../../features/history/viewState';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, shadows, spacing, type } from '../../theme';
import { ScanHistorySummary } from '../../types/domain';

type HistoryFilter = 'food' | 'menu' | 'grocery';
type HistorySection = {
  title: string;
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
  const [selectedFilter, setSelectedFilter] = useState<HistoryFilter>('food');
  const historyQuery = useHistoryFeed(12, { includeDailyReports: false, scanCategory: selectedFilter });

  const remoteScans = useMemo(
    () =>
      historyQuery.data
        ? Array.from(new Map(historyQuery.data.pages.flatMap((page) => page.scans).map((scan) => [scan.id, scan])).values())
        : null,
    [historyQuery.data],
  );
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
    () => groupedScans.map((group) => ({ title: group.label, data: group.items })),
    [groupedScans],
  );

  useEffect(() => {
    trackEvent('history_viewed');
  }, []);

  function openScan(scan: ScanHistorySummary) {
    navigation.navigate('ScanResult', { scanId: scan.id });
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={historyContentState === 'content' ? historySections : []}
        keyExtractor={(scan) => scan.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: 120 + insets.bottom },
        ]}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <TabScreenHeader title="Scans" />
            <HistoryFilterRail selectedFilter={selectedFilter} onSelect={setSelectedFilter} />
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.groupLabel}>{section.title}</Text>}
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
            <EmptyState title="Nothing here yet" subtitle={emptyCopy(selectedFilter)} />
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
    </View>
  );
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
        <SkeletonBlock width={52} height={52} radius={26} />
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
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
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.outlineVariant,
    ...shadows.card,
  },
  filterChipText: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  filterChipTextSelected: {
    color: palette.text,
    fontFamily: type.body.semibold,
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
  groupLabel: {
    color: palette.textMuted,
    fontFamily: type.body.bold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  loadMoreButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(255,255,255,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
  },
});

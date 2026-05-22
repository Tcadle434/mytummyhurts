import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryCard } from '../../components/cards/HistoryCard';
import { EmptyState, TabScreenHeader } from '../../components/common/UI';
import { groupHistoryScans, useHistoryFeed } from '../../features/history/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, shadows, spacing, type } from '../../theme';
import { ScanCategory, ScanHistorySummary } from '../../types/domain';

type HistoryFilter = 'food' | 'menu' | 'grocery';

const filters: { id: HistoryFilter; label: string }[] = [
  { id: 'food', label: 'Food' },
  { id: 'menu', label: 'Menu' },
  { id: 'grocery', label: 'Grocery' },
];

export function HistoryScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const fallbackScans = useAppStore((state) => state.scans);
  const deleteScanRecord = useAppStore((state) => state.deleteScanRecord);
  const [selectedFilter, setSelectedFilter] = useState<HistoryFilter>('food');
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null);
  const historyQuery = useHistoryFeed();

  const scans = historyQuery.data
    ? Array.from(new Map(historyQuery.data.pages.flatMap((page) => page.scans).map((scan) => [scan.id, scan])).values())
    : fallbackScans;
  const groupedScans = useMemo(
    () => groupHistoryScans(filterScans(scans, selectedFilter)),
    [scans, selectedFilter],
  );
  const hasContent = groupedScans.some((group) => group.items.length > 0);

  useEffect(() => {
    trackEvent('history_viewed');
  }, []);

  function confirmDeleteScan(scanId: string, title: string) {
    Alert.alert('Delete history item?', `Remove "${title}" from your history? This removes it from learning evidence too.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void handleDeleteScan(scanId);
        },
      },
    ]);
  }

  async function handleDeleteScan(scanId: string) {
    setDeletingScanId(scanId);
    try {
      await deleteScanRecord(scanId);
    } catch (error) {
      Alert.alert('Could not delete item', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setDeletingScanId((current) => (current === scanId ? null : current));
    }
  }

  function openScan(scan: ScanHistorySummary) {
    navigation.navigate('ScanResult', { scanId: scan.id });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: 120 + insets.bottom },
        ]}
      >
        <TabScreenHeader title="Scans" />

        <View style={styles.filterRail}>
          {filters.map((filter) => (
            <Pressable
              key={filter.id}
              onPress={() => setSelectedFilter(filter.id)}
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

        {hasContent ? (
          <View style={styles.sectionBlock}>
            {groupedScans.map((group) => (
              <View key={group.label} style={styles.groupBlock}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                {group.items.map((scan) => (
                  <HistoryCard
                    key={scan.id}
                    scan={scan}
                    onOpen={() => openScan(scan)}
                    onDelete={() => confirmDeleteScan(scan.id, scan.dishName)}
                    deleteDisabled={deletingScanId === scan.id}
                    deleteLabel={deletingScanId === scan.id ? 'Deleting...' : 'Delete'}
                  />
                ))}
              </View>
            ))}

            {historyQuery.hasNextPage ? (
              <Pressable
                onPress={() => void historyQuery.fetchNextPage()}
                disabled={historyQuery.isFetchingNextPage}
                style={({ pressed }) => [styles.loadMoreButton, (pressed || historyQuery.isFetchingNextPage) && { opacity: 0.82 }]}
              >
                <Text style={styles.loadMoreLabel}>{historyQuery.isFetchingNextPage ? 'Loading more...' : 'Load more'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <EmptyState title="Nothing here yet" subtitle={emptyCopy(selectedFilter)} />
        )}
      </ScrollView>
    </View>
  );
}

function filterScans(scans: ScanHistorySummary[], filter: ScanCategory) {
  return scans
    .filter((scan) => (scan.scanCategory ?? 'food') === filter)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function emptyCopy(filter: HistoryFilter) {
  if (filter === 'menu') {
    return 'Scan a restaurant menu to see the best and worst options for your gut.';
  }

  if (filter === 'grocery') {
    return 'Grocery and barcode scanning are planned for the next milestone.';
  }

  return 'Take a photo, upload one, or describe what you ate to start building your food log.';
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
  groupBlock: {
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

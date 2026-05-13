import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HistoryCard } from '../../components/cards/HistoryCard';
import { EmptyState, ScreenHeader } from '../../components/common/UI';
import { BottomSheet } from '../../components/modals/BottomSheet';
import { groupHistoryScans, useHistoryFeed } from '../../features/history/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, shadows, spacing, type } from '../../theme';
import { ScanCategory, ScanRecord } from '../../types/domain';

type HistoryFilter = 'food' | 'menu' | 'grocery';

const filters: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'food', label: 'Food' },
  { id: 'menu', label: 'Menu' },
  { id: 'grocery', label: 'Grocery' },
];

export function HistoryScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const fallbackScans = useAppStore((state) => state.scans);
  const deleteScanRecord = useAppStore((state) => state.deleteScanRecord);
  const [sheetVisible, setSheetVisible] = useState(false);
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

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}
      >
        <ScreenHeader title="History" subtitle="Food logs are used for learning. Menu and grocery scans will live here too." />

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
                    onOpen={() => navigation.navigate('ScanResult', { scanId: scan.id })}
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

      <Pressable
        onPress={() => {
          setSheetVisible(true);
          trackEvent('add_food_tapped');
        }}
        style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, spacing.lg) }, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Text style={styles.fabLabel}>+</Text>
      </Pressable>

      <BottomSheet visible={sheetVisible} onClose={() => setSheetVisible(false)}>
        <Text style={styles.sheetTitle}>Log food</Text>
        <Text style={styles.sheetSubtitle}>Food entries are assumed eaten and used with daily reports to learn your patterns.</Text>

        <Pressable
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ScanCapture', { sourceType: 'manual_photo', manualMode: true });
          }}
          style={({ pressed }) => [styles.sheetButton, pressed && { opacity: 0.82 }]}
        >
          <Text style={styles.sheetButtonLabel}>Take photo</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ScanCapture', { sourceType: 'manual_upload', manualMode: true });
          }}
          style={({ pressed }) => [styles.sheetSecondaryButton, pressed && { opacity: 0.82 }]}
        >
          <Text style={styles.sheetSecondaryLabel}>Upload photo</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setSheetVisible(false);
            navigation.navigate('ManualMeal', {});
          }}
          style={({ pressed }) => [styles.sheetSecondaryButton, pressed && { opacity: 0.82 }]}
        >
          <Text style={styles.sheetSecondaryLabel}>Describe meal</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

function filterScans(scans: ScanRecord[], filter: ScanCategory) {
  return scans
    .filter((scan) => (scan.scanCategory ?? 'food') === filter)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function emptyCopy(filter: HistoryFilter) {
  if (filter === 'menu') {
    return 'Menu scanning is planned for the next milestone.';
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lift,
  },
  fabLabel: {
    color: palette.white,
    fontFamily: type.body.medium,
    fontSize: 34,
    marginTop: -2,
  },
  sheetTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  sheetButton: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 16,
  },
  sheetSecondaryButton: {
    minHeight: 56,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
});

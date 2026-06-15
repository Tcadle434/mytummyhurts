import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  MenuRankingCard,
  ScanHeroCard,
  toggleExpandedId,
  type MenuTierItem,
} from '../../components/scan-result/ScanResultCards';
import { SkeletonImage } from '../../components/common/SkeletonImage';
import { AppScreen, PrimaryButton, ScreenHeader, SectionCard } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, tokens } from '../../theme';
import { ScanRecord } from '../../types/domain';
import { DeleteAction, formatTimestamp, ResultImageFallback, sharedResultStyles as shared } from './resultShared';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

export function MenuScanResult({
  scan,
  navigation,
}: {
  scan: ScanRecord;
  navigation: Props['navigation'];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const deleteScanRecord = useAppStore((state) => state.deleteScanRecord);
  const updateScanConsumption = useAppStore((state) => state.updateScanConsumption);
  const [consumedItemIds, setConsumedItemIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const menu = scan.menuResult!;
  const rankedItems = rankedMenuItems(menu);

  function confirmDelete() {
    if (isDeleting) {
      return;
    }

    Alert.alert(
      'Delete this scan?',
      `Remove "${menu.menuTitle}" from your history? This removes it from learning evidence too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDelete();
          },
        },
      ],
    );
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteScanRecord(scan.id);
      trackEvent('scan_result_deleted', { scan_id: scan.id, scan_category: 'menu' });
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error) {
      setIsDeleting(false);
      Alert.alert('Could not delete scan', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Menu result" title="Menu risk ranking" />

      <ScanHeroCard
        title={menu.menuTitle}
        meta={`${menu.inputPageCount} page${menu.inputPageCount === 1 ? '' : 's'} analyzed • ${formatTimestamp(scan.createdAt)}`}
        verdict={`We ranked ${menu.items.length} item${menu.items.length === 1 ? '' : 's'} for your gut — safest picks first.`}
        image={
          <SkeletonImage
            uri={scan.imageUri}
            style={shared.heroSlotImage}
            resizeMode="cover"
            skeletonRadius={18}
            accessibilityLabel={`${menu.menuTitle} photo`}
            fallback={<ResultImageFallback />}
          />
        }
      />

      {menu.summary ? (
        <SectionCard style={styles.menuSummaryCard}>
          <View style={styles.menuSummaryIcon}>
            <Ionicons name="restaurant-outline" size={22} color={palette.primary} />
          </View>
          <View style={styles.menuSummaryCopy}>
            <Text style={shared.sectionBody}>{menu.summary}</Text>
          </View>
        </SectionCard>
      ) : null}

      <MenuRankingCard
        items={rankedItems.map((item) => ({
          ...toMenuTierItem(item),
          consumed: Boolean(item.consumedAt) || consumedItemIds.has(item.sourceItemId),
        }))}
        expandedId={expanded}
        onToggle={(id) => toggleExpandedId(expanded, id, setExpanded)}
        onConsume={(item) => {
          if (!item.sourceItemId) {
            return;
          }
          setConsumedItemIds((current) => new Set(current).add(item.sourceItemId!));
          void updateScanConsumption({
            scanId: scan.id,
            consumedMenuItemSourceIds: [item.sourceItemId],
          });
        }}
      />

      {rankedItems.length < 3 ? (
        <SectionCard>
          <Text style={shared.sectionTitle}>Limited menu read</Text>
          <Text style={shared.sectionBody}>We only found enough detail to rank a few menu items.</Text>
        </SectionCard>
      ) : null}

      <Text style={shared.disclaimerText}>
        Informational guidance, not medical advice. For diagnosis or treatment, talk to a clinician.
      </Text>

      <View style={shared.actionStack}>
        <PrimaryButton label="Scan another" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'menu', initialMode: 'menu' })} />
        <DeleteAction onPress={confirmDelete} isDeleting={isDeleting} />
      </View>
    </AppScreen>
  );
}

export function MenuResultUnavailable({
  navigation,
  scan,
}: {
  navigation: Props['navigation'];
  scan: ScanRecord;
}) {
  const deleteScanRecord = useAppStore((state) => state.deleteScanRecord);
  const [isDeleting, setIsDeleting] = useState(false);

  function confirmDelete() {
    if (isDeleting) {
      return;
    }

    Alert.alert(
      'Delete this scan?',
      `Remove "${scan.dishName || 'this menu scan'}" from your history? This removes it from learning evidence too.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void handleDelete();
          },
        },
      ],
    );
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteScanRecord(scan.id);
      trackEvent('scan_result_deleted', { scan_id: scan.id, scan_category: 'menu' });
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error) {
      setIsDeleting(false);
      Alert.alert('Could not delete scan', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Menu result"
        title="Menu ranking unavailable"
        subtitle="This saved menu scan is missing its ranking details, so we are not showing it as a meal result."
      />

      <SectionCard>
        <Text style={shared.sectionTitle}>{scan.dishName || 'Menu scan'}</Text>
        <Text style={shared.sectionBody}>
          Scan the menu again to rebuild the lowest and highest risk options.
        </Text>
      </SectionCard>

      <View style={shared.actionStack}>
        <PrimaryButton
          label="Scan another"
          onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'menu', initialMode: 'menu' })}
        />
        <DeleteAction onPress={confirmDelete} isDeleting={isDeleting} />
      </View>
    </AppScreen>
  );
}

function rankedMenuItems(menu: NonNullable<ScanRecord['menuResult']>) {
  const items = menu.items?.length
    ? menu.items
    : [...menu.bestForYou, ...menu.eatWithCaution, ...menu.tryToAvoid];
  return [...items].sort((left, right) => left.displayOrder - right.displayOrder);
}

function toMenuTierItem(item: NonNullable<ScanRecord['menuResult']>['items'][number]): MenuTierItem {
  return {
    id: item.id,
    sourceItemId: item.sourceItemId,
    consumed: Boolean(item.consumedAt),
    rank: item.displayOrder + 1,
    name: item.name,
    section: item.section,
    price: item.price,
    score: item.riskScore,
    level: item.riskLevel,
    reason: item.whyThisScore,
    insight: item.whyThisScore,
    triggers: item.ingredientRisks.length ? item.ingredientRisks.slice(0, 3).map((ingredient) => ingredient.canonicalName) : undefined,
    scoreContributors: item.scoreContributors,
    scoringConfidence: item.scoringConfidence,
    dietEvaluations: item.dietEvaluations,
    saferSwap: item.gutRecommendation,
  };
}

const styles = StyleSheet.create({
  menuSummaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  menuSummaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuSummaryCopy: {
    flex: 1,
    gap: spacing.xs,
  },
});

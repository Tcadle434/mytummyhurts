import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import {
  MenuBandSection,
  MenuTopPickCard,
  ScanHeroCard,
  toggleExpandedId,
  type MenuTierItem,
} from '../../components/scan-result/ScanResultCards';
import { SkeletonImage } from '../../components/common/SkeletonImage';
import {
  AppScreen,
  PipAnalysisCard,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
} from '../../components/common/UI';
import {
  DEFAULT_PORTION,
  menuItemConsumptionUpdate,
} from '../../features/scan/consumptionPortions';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { ConsumptionPortion, MenuRecommendationTier, RiskLevel, ScanRecord } from '../../types/domain';
import { DeleteAction, formatTimestamp, ResultImageFallback, sharedResultStyles as shared } from './resultShared';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

// The three tiers as worded, toned bands. Titles echo the app's calm / mixed /
// rough voice instead of system vocabulary; each band header wears its risk
// tone's text-grade foreground.
const MENU_BANDS: {
  tier: MenuRecommendationTier;
  level: RiskLevel;
  title: string;
  spotlightFollowUpTitle: string;
  subtitle: string;
}[] = [
  {
    tier: 'best_for_you',
    level: 'low',
    title: 'Easier picks',
    spotlightFollowUpTitle: 'More easier picks',
    subtitle: 'Closest to what usually sits fine for you.',
  },
  {
    tier: 'eat_with_caution',
    level: 'medium',
    title: 'Middle of the menu',
    spotlightFollowUpTitle: 'Middle of the menu',
    subtitle: 'Could go either way — open one for the why.',
  },
  {
    tier: 'try_to_avoid',
    level: 'high',
    title: 'Likely rough',
    spotlightFollowUpTitle: 'Likely rough',
    subtitle: 'These lean hardest on your triggers.',
  },
];

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
  const [itemPortions, setItemPortions] = useState<Record<string, ConsumptionPortion>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const menu = scan.menuResult!;
  const rankedItems = rankedMenuItems(menu);
  // Ranked entries keep their tier alongside the display item so the top pick
  // and the worded bands stay in agreement with the ranking order.
  const rankedEntries = rankedItems.map((item) => ({
    tier: item.tier,
    item: {
      ...toMenuTierItem(item),
      consumed: Boolean(item.consumedAt) || consumedItemIds.has(item.sourceItemId),
      portion: itemPortions[item.sourceItemId] ?? item.consumedPortion,
    },
  }));
  const topPick = rankedEntries[0];
  const remainingEntries = rankedEntries.slice(1);
  const easierCount = rankedEntries.filter((entry) => entry.tier === 'best_for_you').length;

  // Logging an item and refining its portion share one path: the first tap
  // records a normal portion, a portion-chip tap re-sends with the choice.
  function handleConsume(item: MenuTierItem, portion?: ConsumptionPortion) {
    if (!item.sourceItemId) {
      return;
    }
    const sourceItemId = item.sourceItemId;
    const nextPortion = portion ?? itemPortions[sourceItemId] ?? item.portion ?? DEFAULT_PORTION;
    setConsumedItemIds((current) => new Set(current).add(sourceItemId));
    setItemPortions((current) => ({ ...current, [sourceItemId]: nextPortion }));
    void updateScanConsumption(menuItemConsumptionUpdate(scan.id, sourceItemId, nextPortion));
  }

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
      <ScreenHeader
        title={menu.menuTitle}
        subtitle={`${menu.inputPageCount} page${menu.inputPageCount === 1 ? '' : 's'} analyzed • ${formatTimestamp(scan.createdAt)}`}
      />

      <ScanHeroCard
        verdict={menuVerdictCopy(rankedEntries.length, easierCount)}
        image={
          <SkeletonImage
            uri={scan.imageUri}
            style={shared.heroImage}
            resizeMode="cover"
            skeletonRadius={0}
            accessibilityLabel={`${menu.menuTitle} photo`}
            fallback={<ResultImageFallback />}
          />
        }
      />

      {topPick ? (
        <MenuTopPickCard
          item={topPick.item}
          expanded={expanded === topPick.item.id}
          onToggle={() => toggleExpandedId(expanded, topPick.item.id, setExpanded)}
          onConsume={handleConsume}
        />
      ) : null}

      {menu.summary ? <PipAnalysisCard body={menu.summary} /> : null}

      {MENU_BANDS.map((band) => (
        <MenuBandSection
          key={band.tier}
          title={topPick?.tier === band.tier ? band.spotlightFollowUpTitle : band.title}
          subtitle={band.subtitle}
          level={band.level}
          items={remainingEntries
            .filter((entry) => entry.tier === band.tier)
            .map((entry) => entry.item)}
          expandedId={expanded}
          onToggle={(id) => toggleExpandedId(expanded, id, setExpanded)}
          onConsume={handleConsume}
        />
      ))}

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

// The hero verdict answers "how did this menu go for me?" with the count of
// easier picks inline — and never claims more comfort than the ranking found.
function menuVerdictCopy(total: number, easierCount: number): string {
  if (total === 0) {
    return 'We could not read enough of this menu to rank its items.';
  }
  if (total === 1) {
    return easierCount > 0
      ? 'The one dish we could read looks easy on your gut.'
      : 'We could only read one dish — here is how it sits with you.';
  }
  if (easierCount === 0) {
    return `We ranked ${total} items from easiest to hardest on your gut.`;
  }
  if (easierCount === total) {
    return `All ${total} items here look gentle on your gut.`;
  }
  return `${easierCount} of ${total} look${easierCount === 1 ? 's' : ''} easier on your gut.`;
}

// `reason` carries the item's one-line why on the scan line, so `insight` is
// left unset — the expanded detail leads with the numeric score instead of
// repeating the same sentence.
function toMenuTierItem(item: NonNullable<ScanRecord['menuResult']>['items'][number]): MenuTierItem {
  return {
    id: item.id,
    sourceItemId: item.sourceItemId,
    consumed: Boolean(item.consumedAt),
    name: item.name,
    section: item.section,
    price: item.price,
    score: item.riskScore,
    level: item.riskLevel,
    reason: item.whyThisScore,
    triggers: item.ingredientRisks.length ? item.ingredientRisks.slice(0, 3).map((ingredient) => ingredient.canonicalName) : undefined,
    scoreContributors: item.scoreContributors,
    scoringConfidence: item.scoringConfidence,
    dietEvaluations: item.dietEvaluations,
    ingredientRisks: item.ingredientRisks,
    saferSwap: item.gutRecommendation,
  };
}

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ComponentProps, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { RiskBar } from '../../components/charts/RiskBar';
import {
  IngredientsBreakdownCard,
  DietFitCard,
  MenuRankingCard,
  ScanHeroCard,
  WhyThisScoreCard,
  type HeroConditionChip,
  type MenuTierItem,
  type ScanIngredient,
  toggleExpandedId,
} from '../../components/scan-result/ScanResultCards';
import { ScanResultSkeleton } from '../../components/scan-result/ScanResultSkeleton';
import { SkeletonImage } from '../../components/common/SkeletonImage';
import { AppScreen, PipAnalysisCard, PrimaryButton, ScreenHeader, SectionCard } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useScanDetail } from '../../features/history/hooks';
import { presentRisk, verdictForRisk } from '../../features/scan/riskPresentation';
import { formatConditionName } from '../../utils/conditionFormat';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectLatestScan, useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';
import { ScanIngredientRisk, ScanRecord } from '../../types/domain';
import { normalizeScanRecord, selectPreferredScan } from './resultSelection';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

export function ScanResultScreen({ navigation, route }: Props) {
  const scans = useAppStore((state) => state.scans);
  const authUser = useAppStore((state) => state.authUser);
  const deleteScanRecord = useAppStore((state) => state.deleteScanRecord);
  const [isDeleting, setIsDeleting] = useState(false);
  const storeScan = selectLatestScan(scans, route.params.scanId);
  const shouldFetchDetail = Boolean(isLiveBackendConfigured && authUser);
  const scanDetailQuery = useScanDetail(route.params.scanId, shouldFetchDetail);
  const detailScan = scanDetailQuery.data?.scan;
  const rawScan = useMemo(() => selectPreferredScan(storeScan, detailScan), [detailScan, storeScan]);
  const scan = useMemo(() => (rawScan ? normalizeScanRecord(rawScan) : undefined), [rawScan]);
  const ingredientRisks = useMemo(() => (scan ? scan.ingredientRisks : []), [scan]);
  const updateScanConsumption = useAppStore((state) => state.updateScanConsumption);
  const [consumptionStatus, setConsumptionStatus] = useState<'unknown' | 'consumed' | 'skipped'>(
    rawScan?.consumptionStatus ?? 'unknown',
  );
  const riskPresentation = useMemo(() => (scan ? presentRisk(scan) : {}), [scan]);
  const heroConditionChips = useMemo<HeroConditionChip[]>(
    () =>
      (scan?.conditionRisks ?? [])
        .slice()
        .sort((left, right) => right.riskScore - left.riskScore)
        .slice(0, 2)
        .map((risk) => ({ name: formatConditionName(risk.conditionName), level: risk.riskLevel })),
    [scan?.conditionRisks],
  );

  useEffect(() => {
    trackEvent('scan_result_viewed', { scan_id: route.params.scanId });
  }, [route.params.scanId]);

  if (!scan) {
    if (scanDetailQuery.isLoading || scanDetailQuery.isFetching) {
      return (
        <AppScreen>
          <ScanResultSkeleton />
        </AppScreen>
      );
    }

    return (
      <AppScreen>
        <ScreenHeader eyebrow="Missing scan" title="We couldn't find that result." subtitle="Try scanning the meal again." />
        <PrimaryButton label="Scan again" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'food', initialMode: 'food' })} />
      </AppScreen>
    );
  }

  if (scan.scanCategory === 'menu') {
    if (scan.menuResult) {
      return <MenuScanResult scan={scan} navigation={navigation} />;
    }

    return <MenuResultUnavailable navigation={navigation} scan={scan} />;
  }

  function confirmDelete() {
    if (!scan || isDeleting) {
      return;
    }

    Alert.alert(
      'Delete this scan?',
      `Remove "${scan.dishName}" from your history? This removes it from learning evidence too.`,
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
    if (!scan) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteScanRecord(scan.id);
      trackEvent('scan_result_deleted', { scan_id: scan.id });
      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    } catch (error) {
      setIsDeleting(false);
      Alert.alert('Could not delete scan', error instanceof Error ? error.message : 'Please try again.');
    }
  }

  const scanAnotherParams =
    scan.sourceType === 'barcode'
      ? { sourceType: 'barcode' as const, scanCategory: 'grocery' as const, initialMode: 'barcode' as const }
      : { sourceType: 'camera' as const, scanCategory: 'food' as const, initialMode: 'food' as const };

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Result" title="Scan result" />

      <ScanHeroCard
        title={scan.dishName}
        meta={formatTimestamp(scan.createdAt)}
        score={scan.overallRiskScore}
        level={scan.overallRiskLevel}
        verdict={verdictForRisk(scan.overallRiskScore, riskPresentation.cautionNote)}
        conditionChips={heroConditionChips}
        image={
          <SkeletonImage
            uri={scan.groceryProduct?.imageUrl ?? scan.imageUri}
            style={styles.heroSlotImage}
            resizeMode="cover"
            skeletonRadius={18}
            accessibilityLabel={`${scan.dishName} photo`}
            fallback={
              <ResultImageFallback
                title={scan.dishName}
                compact
                subtitle={undefined}
              />
            }
          />
        }
      />

      <WhyThisScoreCard
        contributors={scan.scoreContributors}
        level={scan.overallRiskLevel}
        impactSummary={scan.gutScoreImpact?.summary}
      />

      <SectionCard>
        <Text style={styles.sectionTitle}>Conditions impact</Text>
        <View style={styles.barList}>
          {(scan.conditionRisks.length
            ? scan.conditionRisks
            : Object.entries(scan.conditionRiskScores).map(([conditionName, risk], index) => ({
                conditionName,
                riskScore: risk.score,
                riskLevel: risk.level,
                reason: '',
                displayOrder: index,
              }))
          ).map((risk) => (
            <View key={risk.conditionName} style={styles.conditionRow}>
              <RiskBar label={formatConditionName(risk.conditionName)} score={risk.riskScore} level={risk.riskLevel} />
              {risk.reason ? <Text style={styles.conditionReason}>{risk.reason}</Text> : null}
            </View>
          ))}
        </View>
      </SectionCard>

      <DietFitCard evaluations={scan.dietEvaluations} />

      <PipAnalysisCard title="Pip's take" body={scan.pipTake ?? scan.interpretation} />

      <IngredientsBreakdownCard
        ingredients={ingredientRisks.map(toScanIngredient)}
      />


      <SectionCard>
        <Text style={styles.sectionTitle}>Did you eat this?</Text>
        <Text style={styles.sectionBody}>
          Confirmed meals count toward your triggers and Daily Score; skipped ones stay out of your data.
        </Text>
        <View style={styles.consumeRow}>
          <ConsumeChoice
            label="Ate it"
            icon="restaurant-outline"
            active={consumptionStatus === 'consumed'}
            onPress={() => {
              setConsumptionStatus('consumed');
              void updateScanConsumption({ scanId: scan.id, consumptionStatus: 'consumed' });
            }}
          />
          <ConsumeChoice
            label="Skipped it"
            icon="close-circle-outline"
            active={consumptionStatus === 'skipped'}
            onPress={() => {
              setConsumptionStatus('skipped');
              void updateScanConsumption({ scanId: scan.id, consumptionStatus: 'skipped' });
            }}
          />
        </View>
      </SectionCard>

      <Text style={styles.disclaimerText}>
        Informational guidance, not medical advice. For diagnosis or treatment, talk to a clinician.
      </Text>

      <View style={styles.actionStack}>
        {route.params.manualMode ? null : (
          <PrimaryButton label={scan.sourceType === 'barcode' ? 'Scan another barcode' : 'Scan another'} onPress={() => navigation.replace('ScanCapture', scanAnotherParams)} />
        )}
        <DeleteAction onPress={confirmDelete} isDeleting={isDeleting} />
      </View>
    </AppScreen>
  );
}

function ConsumeChoice({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.consumeChoice, active && styles.consumeChoiceActive, pressed && { opacity: 0.88 }]}
    >
      <Ionicons name={icon} size={16} color={active ? palette.primaryDark : palette.textMuted} />
      <Text style={[styles.consumeChoiceText, active && { color: palette.primaryDark }]}>{label}</Text>
    </Pressable>
  );
}

function DeleteAction({ onPress, isDeleting }: { onPress: () => void; isDeleting: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDeleting}
      style={({ pressed }) => [styles.deleteAction, (pressed || isDeleting) && { opacity: pressed ? 0.7 : 0.5 }]}
    >
      <Text style={styles.deleteActionLabel}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
    </Pressable>
  );
}

function MenuScanResult({
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
            style={styles.heroSlotImage}
            resizeMode="cover"
            skeletonRadius={18}
            accessibilityLabel={`${menu.menuTitle} photo`}
            fallback={<ResultImageFallback title="Menu" compact subtitle={undefined} />}
          />
        }
      />

      {menu.summary ? (
        <SectionCard style={styles.menuSummaryCard}>
          <View style={styles.menuSummaryIcon}>
            <Ionicons name="restaurant-outline" size={22} color={palette.primary} />
          </View>
          <View style={styles.menuSummaryCopy}>
            <Text style={styles.sectionBody}>{menu.summary}</Text>
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
          <Text style={styles.sectionTitle}>Limited menu read</Text>
          <Text style={styles.sectionBody}>We only found enough detail to rank a few menu items.</Text>
        </SectionCard>
      ) : null}

      <Text style={styles.disclaimerText}>
        Informational guidance, not medical advice. For diagnosis or treatment, talk to a clinician.
      </Text>

      <View style={styles.actionStack}>
        <PrimaryButton label="Scan another" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'menu', initialMode: 'menu' })} />
        <DeleteAction onPress={confirmDelete} isDeleting={isDeleting} />
      </View>
    </AppScreen>
  );
}

function MenuResultUnavailable({
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
        <Text style={styles.sectionTitle}>{scan.dishName || 'Menu scan'}</Text>
        <Text style={styles.sectionBody}>
          Scan the menu again to rebuild the lowest and highest risk options.
        </Text>
      </SectionCard>

      <View style={styles.actionStack}>
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

function toScanIngredient(ingredient: ScanIngredientRisk): ScanIngredient {
  return {
    name: ingredient.rawName || ingredient.canonicalName,
    level: ingredient.riskLevel,
  };
}



function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ResultImageFallback({
  title,
  subtitle,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.fallbackImage, compact && styles.fallbackImageCompact]}>
      <Text style={[styles.fallbackTitle, compact && styles.fallbackTitleCompact]}>{title.charAt(0).toUpperCase()}</Text>
      {subtitle ? <Text style={styles.fallbackSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.7,
  },
  heroMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  heroImage: {
    width: 104,
    height: 104,
    borderRadius: 28,
  },
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
  menuSectionCard: {
    gap: spacing.md,
  },
  menuOptionList: {
    gap: spacing.sm,
  },
  menuOptionCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
    padding: spacing.md,
    gap: spacing.md,
  },
  menuOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRankLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 15,
  },
  menuOptionCopy: {
    flex: 1,
    gap: 2,
  },
  menuOptionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  menuOptionMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  menuRiskPill: {
    minWidth: 48,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  menuRiskScore: {
    fontFamily: type.body.bold,
    fontSize: 17,
  },
  menuExpanded: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border.subtle,
  },
  menuReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  menuReasonText: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  menuModification: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: tokens.color.status.success.background,
    padding: spacing.sm,
  },
  menuModificationText: {
    flex: 1,
    color: palette.primaryDark,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  riskCard: {
    gap: spacing.sm,
  },
  riskEyebrow: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  riskWord: {
    fontFamily: type.body.bold,
    fontSize: 54,
    lineHeight: 58,
    letterSpacing: -1.4,
  },
  riskScoreBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  riskScore: {
    fontFamily: type.body.bold,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1.2,
  },
  riskScale: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  heroSlotImage: {
    width: 64,
    height: 64,
  },
  barList: {
    gap: spacing.md,
  },
  conditionRow: {
    gap: spacing.xs,
  },
  conditionReason: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  swapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.status.success.background,
    borderWidth: 1,
    borderColor: tokens.color.border.emphasis,
    paddingHorizontal: spacing.md,
  },
  swapIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.color.surface.card.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapCopy: {
    flex: 1,
    gap: 2,
  },
  swapTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
  swapDetail: {
    color: palette.primary,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  ingredientList: {
    gap: spacing.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ingredientDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ingredientCopy: {
    flex: 1,
    gap: 1,
  },
  ingredientName: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
    textTransform: 'capitalize',
  },
  ingredientMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  ingredientRisk: {
    fontFamily: type.body.semibold,
    fontSize: 15,
  },
  inferredWrap: {
    gap: spacing.sm,
  },
  inferredLabel: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 14,
  },
  metaStack: {
    gap: 4,
  },
  metaLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  metaValue: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  consumeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  consumeChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
  },
  consumeChoiceActive: {
    borderColor: palette.primary,
    backgroundColor: tokens.color.surface.card.success,
  },
  consumeChoiceText: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  disclaimerText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.regular,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  actionStack: {
    gap: spacing.sm,
  },
  deleteAction: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionLabel: {
    color: palette.danger,
    fontFamily: type.body.semibold,
    fontSize: 16,
    letterSpacing: 0.1,
  },
  fallbackImage: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: components.profileMeter.centerBackground,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  fallbackImageCompact: {
    width: 104,
    height: 104,
  },
  fallbackTitle: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 32,
  },
  fallbackTitleCompact: {
    fontSize: 40,
  },
  fallbackSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    textAlign: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';

import { RiskBar } from '../../components/charts/RiskBar';
import {
  IngredientsBreakdownCard,
  MenuRankingCard,
  RiskHeroCard,
  type MenuTierItem,
  type ScanIngredient,
  toggleExpandedId,
} from '../../components/scan-result/ScanResultCards';
import { AppScreen, InfoPill, PipAnalysisCard, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useScanDetail } from '../../features/history/hooks';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectLatestScan, useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';
import { ScanIngredientRisk, ScanRecord } from '../../types/domain';
import { selectPreferredScan } from './resultSelection';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

const swapSuggestions: { match: string[]; label: string; detail: string }[] = [
  { match: ['dairy', 'cream', 'milk', 'cheese'], label: 'Lactose-free alternative', detail: 'Lower dairy load' },
  { match: ['garlic', 'onion'], label: 'Garlic-infused oil', detail: 'Flavor with lower fructan load' },
  { match: ['wheat', 'bread', 'pasta', 'noodle'], label: 'Gluten-free swap', detail: 'Lower wheat exposure' },
  { match: ['bean', 'lentil', 'chickpea'], label: 'Smaller portion or gentler base', detail: 'Lower fermentable load' },
];

export function ScanResultScreen({ navigation, route }: Props) {
  const scans = useAppStore((state) => state.scans);
  const authUser = useAppStore((state) => state.authUser);
  const [imageFailed, setImageFailed] = useState(false);
  const storeScan = selectLatestScan(scans, route.params.scanId);
  const shouldFetchDetail = Boolean(isLiveBackendConfigured && authUser);
  const scanDetailQuery = useScanDetail(route.params.scanId, shouldFetchDetail);
  const detailScan = scanDetailQuery.data?.scan;
  const scan = useMemo(() => selectPreferredScan(storeScan, detailScan), [detailScan, storeScan]);
  const ingredientRisks = useMemo(() => (scan ? scan.ingredientRisks : []), [scan]);
  const swapSuggestion = useMemo(() => (scan ? findSwapSuggestion(scan, ingredientRisks) : null), [scan, ingredientRisks]);

  useEffect(() => {
    trackEvent('scan_result_viewed', { scan_id: route.params.scanId });
  }, [route.params.scanId]);

  useEffect(() => {
    setImageFailed(false);
  }, [scan?.id]);

  if (!scan) {
    if (scanDetailQuery.isLoading || scanDetailQuery.isFetching) {
      return (
        <AppScreen>
          <ScreenHeader eyebrow="Loading scan" title="Loading that result..." subtitle="Give us a moment to pull the saved analysis." />
        </AppScreen>
      );
    }

    return (
      <AppScreen>
        <ScreenHeader eyebrow="Missing scan" title="We couldn't find that result." subtitle="Try scanning the meal again." />
        <PrimaryButton label="Scan again" onPress={() => navigation.replace('ScanCapture', {})} />
      </AppScreen>
    );
  }

  if (scan.scanCategory === 'menu') {
    if (scan.menuResult) {
      return <MenuScanResult scan={scan} navigation={navigation} imageFailed={imageFailed} setImageFailed={setImageFailed} />;
    }

    return <MenuResultUnavailable navigation={navigation} scan={scan} />;
  }

  function handleDone() {
    if (!scan) {
      return;
    }

    trackEvent('scan_result_dismissed', { scan_id: scan.id });

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Result" title="Scan result" />

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{scan.dishName}</Text>
          <Text style={styles.heroMeta}>{formatTimestamp(scan.createdAt)}</Text>
        </View>

        {scan.imageUri && !imageFailed ? (
          <RNImage source={{ uri: scan.imageUri }} style={styles.heroImage} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <ResultImageFallback title={scan.dishName} compact subtitle={imageFailed ? 'Photo unavailable' : undefined} />
        )}
      </View>

      <RiskHeroCard
        eyebrow="Personalized risk"
        score={scan.overallRiskScore}
        level={scan.overallRiskLevel}
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
            <RiskBar key={risk.conditionName} label={risk.conditionName} score={risk.riskScore} level={risk.riskLevel} />
          ))}
        </View>
      </SectionCard>

      {scan.possibleTriggers.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Likely triggers</Text>
          <View style={styles.chipWrap}>
            {scan.possibleTriggers.map((trigger) => (
              <InfoPill key={trigger} label={trigger} tone="warm" />
            ))}
          </View>
        </SectionCard>
      ) : null}

      {swapSuggestion ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Safer swap</Text>
          <View style={styles.swapCard}>
            <View style={styles.swapIcon}>
              <Ionicons name="leaf-outline" size={18} color={palette.primary} />
            </View>
            <View style={styles.swapCopy}>
              <Text style={styles.swapTitle}>{swapSuggestion.label}</Text>
              <Text style={styles.swapDetail}>{swapSuggestion.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.primary} />
          </View>
        </SectionCard>
      ) : null}

      <IngredientsBreakdownCard
        ingredients={ingredientRisks.map(toScanIngredient)}
      />

      <PipAnalysisCard title="Pip's take" body={scan.pipTake ?? scan.interpretation} />

      <View style={styles.actionStack}>
        {route.params.manualMode ? (
          <PrimaryButton label="Done" onPress={handleDone} />
        ) : (
          <PrimaryButton label="Scan another" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera' })} />
        )}
        {route.params.manualMode ? null : <SecondaryButton label="Done" onPress={handleDone} />}
      </View>
    </AppScreen>
  );
}

function MenuScanResult({
  scan,
  navigation,
  imageFailed,
  setImageFailed,
}: {
  scan: ScanRecord;
  navigation: Props['navigation'];
  imageFailed: boolean;
  setImageFailed: (failed: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const menu = scan.menuResult!;
  const rankedItems = rankedMenuItems(menu);

  function handleDone() {
    trackEvent('scan_result_dismissed', { scan_id: scan.id, scan_category: 'menu' });
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Menu result" title="Menu risk ranking" />

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{menu.menuTitle}</Text>
          <Text style={styles.heroMeta}>
            {menu.inputPageCount} page{menu.inputPageCount === 1 ? '' : 's'} analyzed • {formatTimestamp(scan.createdAt)}
          </Text>
        </View>

        {scan.imageUri && !imageFailed ? (
          <RNImage source={{ uri: scan.imageUri }} style={styles.heroImage} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <ResultImageFallback title="Menu" compact subtitle={imageFailed ? 'Photo unavailable' : undefined} />
        )}
      </View>

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
        items={rankedItems.map(toMenuTierItem)}
        expandedId={expanded}
        onToggle={(id) => toggleExpandedId(expanded, id, setExpanded)}
      />

      {rankedItems.length < 3 ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Limited menu read</Text>
          <Text style={styles.sectionBody}>We only found enough detail to rank a few menu items.</Text>
        </SectionCard>
      ) : null}

      <View style={styles.actionStack}>
        <PrimaryButton label="Scan another menu" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'menu' })} />
        <SecondaryButton label="Done" onPress={handleDone} />
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
          label="Scan another menu"
          onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera', scanCategory: 'menu' })}
        />
        <SecondaryButton
          label="Done"
          onPress={() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            })
          }
        />
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
    saferSwap: item.gutRecommendation,
  };
}

function toScanIngredient(ingredient: ScanIngredientRisk): ScanIngredient {
  return {
    name: ingredient.canonicalName,
    level: ingredient.riskLevel,
    note: ingredient.reason || (ingredient.evidence === 'inferred' ? 'Likely inferred from scan' : undefined),
  };
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function findSwapSuggestion(scan: ScanRecord, ingredientRisks: ScanIngredientRisk[]) {
  if (scan.gutRecommendation) {
    return {
      label: 'Lower-risk adjustment',
      detail: scan.gutRecommendation,
    };
  }

  const search = [
    ...scan.possibleTriggers,
    ...ingredientRisks.map((ingredient) => ingredient.canonicalName),
  ].map(normalizeToken);

  return swapSuggestions.find((suggestion) => suggestion.match.some((match) => search.some((entry) => entry.includes(match))));
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
  barList: {
    gap: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  actionStack: {
    gap: spacing.sm,
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

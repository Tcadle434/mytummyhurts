import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import {
  IngredientsBreakdownCard,
  DietFitCard,
  ScanHeroCard,
  WhyThisScoreCard,
} from '../../components/scan-result/ScanResultCards';
import { ScanResultSkeleton } from '../../components/scan-result/ScanResultSkeleton';
import { SkeletonImage } from '../../components/common/SkeletonImage';
import { AppScreen, PrimaryButton, ScreenHeader, SectionCard } from '../../components/common/UI';
import { isLiveBackendConfigured } from '../../config/env';
import { useScanDetail } from '../../features/history/hooks';
import { presentRisk, verdictForRisk } from '../../features/scan/riskPresentation';
import { formatConditionName } from '../../utils/conditionFormat';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectLatestScan, useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { MenuResultUnavailable, MenuScanResult } from './MenuScanResult';
import { normalizeScanRecord, selectPreferredScan } from './resultSelection';
import {
  ConsumeChoice,
  DeleteAction,
  formatTimestamp,
  ResultImageFallback,
  sharedResultStyles as shared,
  toScanIngredient,
} from './resultShared';

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
  const conditionRows = useMemo(
    () =>
      (scan?.conditionRisks.length
        ? scan.conditionRisks
        : Object.entries(scan?.conditionRiskScores ?? {}).map(([conditionName, risk], index) => ({
            conditionName,
            riskScore: risk.score,
            riskLevel: risk.level,
            reason: '',
            displayOrder: index,
          }))
      ).map((risk) => ({
        name: formatConditionName(risk.conditionName),
        score: risk.riskScore,
        level: risk.riskLevel,
      })),
    [scan?.conditionRisks, scan?.conditionRiskScores],
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
        conditionRows={conditionRows}
        image={
          <SkeletonImage
            uri={scan.groceryProduct?.imageUrl ?? scan.imageUri}
            style={shared.heroSlotImage}
            resizeMode="cover"
            skeletonRadius={18}
            accessibilityLabel={`${scan.dishName} photo`}
            fallback={<ResultImageFallback />}
          />
        }
      />

      <IngredientsBreakdownCard
        ingredients={ingredientRisks.map(toScanIngredient)}
      />

      <DietFitCard evaluations={scan.dietEvaluations} />

      <WhyThisScoreCard
        contributors={scan.scoreContributors}
        level={scan.overallRiskLevel}
        impactSummary={scan.gutScoreImpact?.summary}
      />


      <SectionCard>
        <Text style={shared.sectionTitle}>Did you eat this?</Text>
        <Text style={shared.sectionBody}>
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

      <Text style={shared.disclaimerText}>
        Informational guidance, not medical advice. For diagnosis or treatment, talk to a clinician.
      </Text>

      <View style={shared.actionStack}>
        {route.params.manualMode ? null : (
          <PrimaryButton label={scan.sourceType === 'barcode' ? 'Scan another barcode' : 'Scan another'} onPress={() => navigation.replace('ScanCapture', scanAnotherParams)} />
        )}
        <DeleteAction onPress={confirmDelete} isDeleting={isDeleting} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  consumeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});

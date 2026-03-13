import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Gauge } from '../../components/charts/Gauge';
import { RiskBar } from '../../components/charts/RiskBar';
import {
  AppScreen,
  DetailRow,
  InfoPill,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { trackEvent } from '../../services/analytics';
import { selectLatestScan, useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

export function ScanResultScreen({ navigation, route }: Props) {
  const scans = useAppStore((state) => state.scans);
  const finishOnboarding = useAppStore((state) => state.finishOnboarding);

  const scan = selectLatestScan(scans, route.params.scanId);

  useEffect(() => {
    trackEvent('scan_result_viewed', { scan_id: route.params.scanId });
  }, [route.params.scanId]);

  if (!scan) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Missing scan" title="We couldn't find that result." subtitle="Try scanning the meal again." />
        <PrimaryButton label="Scan again" onPress={() => navigation.replace('ScanCapture', {})} />
      </AppScreen>
    );
  }

  function handleDone() {
    if (!scan) {
      return;
    }

    trackEvent('scan_result_dismissed', { scan_id: scan.id });

    if (route.params.fromOnboarding) {
      finishOnboarding();
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Result" title={scan.dishName} subtitle={scan.interpretation} />

      <SectionCard>
        {scan.imageUri ? (
          <Image source={scan.imageUri} style={{ width: '100%', height: 200, borderRadius: 20 }} contentFit="cover" />
        ) : (
          <View
            style={{
              height: 200,
              borderRadius: 20,
              backgroundColor: palette.sageSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: palette.primaryDark, fontFamily: type.body.bold, fontSize: 24 }}>{scan.dishName}</Text>
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <Gauge score={scan.overallRiskScore} label={scan.overallRiskLevel} />
      </SectionCard>

      <SectionCard>
        <InfoPill label={scan.overallRiskLevel === 'high' ? 'Proceed carefully' : scan.overallRiskLevel === 'medium' ? 'Mixed read' : 'Looks gentler'} tone={scan.overallRiskLevel === 'high' ? 'warm' : 'soft'} />
        {Object.entries(scan.conditionRiskScores).map(([condition, risk]) => (
          <RiskBar key={condition} label={condition} score={risk.score} level={risk.level} />
        ))}
      </SectionCard>

      {scan.possibleTriggers.length ? (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Possible triggers</Text>
          <DetailRow label="Most likely watch-outs" value={scan.possibleTriggers.join(', ')} />
        </SectionCard>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {route.params.manualMode ? (
          <PrimaryButton label="Continue" onPress={() => navigation.replace('ManualMeal', { scanId: scan.id })} />
        ) : (
          <PrimaryButton
            label="Scan another"
            onPress={() => {
              trackEvent('scan_another_tapped', { scan_id: scan.id });
              navigation.replace('ScanCapture', { sourceType: 'camera' });
            }}
          />
        )}
        <SecondaryButton label="Done" onPress={handleDone} />
      </View>
    </AppScreen>
  );
}

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanAnalyzing'>;

const messages = [
  'Analyzing your meal',
  'Looking for possible triggers',
  'Comparing with your sensitivities',
  'Building your risk score',
];

export function ScanAnalyzingScreen({ navigation, route }: Props) {
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ticker = setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 700);

    const timeout = setTimeout(async () => {
      try {
        const result = await analyzeScanInput(route.params.payload);
        navigation.replace('ScanResult', {
          scanId: result.scanId,
          mealId: result.mealId,
          manualMode: route.params.manualMode,
          fromOnboarding: route.params.fromOnboarding,
        });
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'The scan could not be completed.');
      }
    }, 2200);

    return () => {
      clearInterval(ticker);
      clearTimeout(timeout);
    };
  }, [analyzeScanInput, navigation, route.params]);

  if (error) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Analysis failed" title="The meal could not be analyzed." subtitle={error} />
        <SectionCard>
          <PrimaryButton label="Try again" onPress={() => navigation.replace('ScanCapture', route.params)} />
          <SecondaryButton label="Go back" onPress={() => navigation.goBack()} />
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <View style={styles.loaderCard}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.title}>{messages[messageIndex]}</Text>
        <Text style={styles.body}>We are comparing visible ingredients against your profile and learned patterns.</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    gap: spacing.xl,
  },
  loaderCard: {
    backgroundColor: 'rgba(255,252,246,0.95)',
    borderRadius: 34,
    padding: spacing.xxl,
    gap: spacing.md,
    alignItems: 'center',
  },
  title: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 28,
    textAlign: 'center',
  },
  body: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppScreen, ScreenHeader, SectionCard } from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, shadows, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanAnalyzing'>;

const steps = [
  'Detecting ingredients',
  'Cross-checking with your profile',
  'Estimating what to expect',
  'Saving to your food log',
];

const menuSteps = [
  'Reading menu pages',
  'Extracting menu items',
  'Cross-checking your profile',
  'Ranking best and worst options',
];

export function ScanAnalyzingScreen({ navigation, route }: Props) {
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const [progress, setProgress] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const isMenuScan = route.params.payload.scanCategory === 'menu';
  const activeSteps = isMenuScan ? menuSteps : steps;

  const completedSteps = useMemo(() => {
    if (progress >= 88) return 4;
    if (progress >= 68) return 3;
    if (progress >= 42) return 2;
    if (progress >= 18) return 1;
    return 0;
  }, [progress]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setProgress((current) => {
        if (current >= 87) {
          return current;
        }

        const next = current + (current < 45 ? 4 : current < 70 ? 3 : 2);
        return Math.min(next, 87);
      });
    }, 280);

    let active = true;

    void analyzeScanInput(route.params.payload)
      .then((result) => {
        if (!active) {
          return;
        }

        setProgress(100);
        setTimeout(() => {
          navigation.replace('ScanResult', {
            scanId: result.scanId,
            manualMode: route.params.manualMode,
          });
        }, 220);
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : 'The scan could not be completed.');
      });

    return () => {
      active = false;
      clearInterval(ticker);
    };
  }, [analyzeScanInput, navigation, route.params]);

  if (error) {
    return (
      <AppScreen>
        <ScreenHeader
          eyebrow="Analysis failed"
          title={isMenuScan ? 'The menu could not be analyzed.' : 'The meal could not be analyzed.'}
          subtitle={error}
        />
        <SectionCard>
          <Pressable
            onPress={() => navigation.replace('ScanCapture', { sourceType: route.params.payload.sourceType, manualMode: route.params.manualMode, scanCategory: route.params.payload.scanCategory })}
            style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.82 }]}
          >
            <Text style={styles.primaryActionLabel}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.82 }]}>
            <Text style={styles.secondaryActionLabel}>Go back</Text>
          </Pressable>
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Pip state="thinking" size={72} />
        <Text style={styles.heroTitle}>{isMenuScan ? 'Analyzing your menu...' : 'Analyzing your meal...'}</Text>
        <Text style={styles.heroSubtitle}>This usually takes a few seconds.</Text>
      </View>

      <ProgressRing progress={progress} />

      <SectionCard style={styles.checklistCard}>
        <Text style={styles.checklistTitle}>{isMenuScan ? 'Ranking menu options' : 'Checking for triggers'}</Text>
        {activeSteps.map((step, index) => {
          const state = index < completedSteps ? 'done' : index === completedSteps ? 'active' : 'idle';
          return (
            <View key={step} style={styles.checkRow}>
              <View style={[styles.checkIcon, state === 'done' && styles.checkIconDone, state === 'active' && styles.checkIconActive]}>
                {state === 'done' ? <Text style={styles.checkDone}>✓</Text> : state === 'active' ? <View style={styles.checkPulse} /> : null}
              </View>
              <Text style={[styles.checkLabel, state === 'idle' && styles.checkLabelIdle]}>{step}</Text>
            </View>
          );
        })}
      </SectionCard>

      <View style={styles.privacyPill}>
        <Text style={styles.privacyIcon}>🔒</Text>
        <Text style={styles.privacyLabel}>Your data stays private</Text>
      </View>
    </AppScreen>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 66;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (circumference * Math.min(progress, 100)) / 100;

  return (
    <View style={styles.ringWrap}>
        <Svg width={160} height={160}>
          <Circle cx="80" cy="80" r={radius} stroke={tokens.color.chart.track} strokeWidth={strokeWidth} fill="transparent" />
          <Circle
          cx="80"
          cy="80"
          r={radius}
          stroke={palette.high}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="transparent"
            rotation={-90}
            origin="80,80"
          />
          <Circle cx="80" cy="80" r={radius - 20} fill={tokens.color.surface.frosted} />
        </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>{Math.round(progress)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 34,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.regular,
    fontSize: 18,
    textAlign: 'center',
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 34,
    letterSpacing: -0.8,
  },
  checklistCard: {
    gap: spacing.md,
  },
  checklistTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: tokens.color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIconDone: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkIconActive: {
    borderColor: palette.primary,
  },
  checkDone: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 13,
    marginTop: -1,
  },
  checkPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.primary,
  },
  checkLabel: {
    color: tokens.color.text.primary,
    fontFamily: type.body.medium,
    fontSize: 18,
  },
  checkLabelIdle: {
    color: tokens.color.text.tertiary,
  },
  privacyPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.surface.card.warm,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  privacyIcon: {
    fontSize: 16,
  },
  privacyLabel: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  primaryAction: {
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lift,
  },
  primaryActionLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 16,
  },
  secondaryAction: {
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: components.button.secondary.backgroundColor,
    borderWidth: 1,
    borderColor: components.button.secondary.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionLabel: {
    color: tokens.color.text.primary,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
});

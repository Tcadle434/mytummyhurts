import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AppScreen, ScreenHeader, SectionCard } from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, shadows, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanAnalyzing'>;

const ELAPSED_REVEAL_DELAY_SEC = 3;

export function ScanAnalyzingScreen({ navigation, route }: Props) {
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const isMenuScan = route.params.payload.scanCategory === 'menu';
  const isGroceryScan = route.params.payload.scanCategory === 'grocery';
  const retryInitialMode = isGroceryScan || route.params.payload.sourceType === 'barcode'
    ? 'barcode'
    : isMenuScan
      ? 'menu'
      : 'food';

  const title = isMenuScan
    ? 'Analyzing your menu…'
    : isGroceryScan
      ? 'Analyzing barcode…'
      : 'Analyzing your meal…';

  const subtitle = isMenuScan
    ? 'Menus take a little longer — up to 2 minutes while Pip ranks every option.'
    : isGroceryScan
      ? 'Usually under 15 seconds.'
      : 'This can take up to 2 minutes. Pip is reading every ingredient.';

  useEffect(() => {
    const ticker = setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    let active = true;

    void analyzeScanInput(route.params.payload)
      .then((result) => {
        if (!active) {
          return;
        }
        navigation.replace('ScanResult', {
          scanId: result.scanId,
          manualMode: route.params.manualMode,
        });
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
          title={isMenuScan ? 'The menu could not be analyzed.' : isGroceryScan ? 'The grocery item could not be analyzed.' : 'The meal could not be analyzed.'}
          subtitle={error}
        />
        <SectionCard>
          <Pressable
            onPress={() => navigation.replace('ScanCapture', {
              sourceType: route.params.payload.sourceType,
              manualMode: route.params.manualMode,
              scanCategory: route.params.payload.scanCategory,
              initialMode: retryInitialMode,
            })}
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
      <IndeterminateRing />

      <View style={styles.copy}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
        {elapsed >= ELAPSED_REVEAL_DELAY_SEC ? (
          <Text style={styles.elapsed}>{formatElapsed(elapsed)} elapsed</Text>
        ) : null}
      </View>
    </AppScreen>
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function IndeterminateRing() {
  const rotation = useSharedValue(0);
  const breath = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1600, easing: Easing.linear }),
      -1,
      false,
    );
    breath.value = withRepeat(
      withTiming(1.035, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [rotation, breath]);

  const arcStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const pipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const size = 160;
  const radius = 66;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.28;
  const gapLength = circumference - arcLength;
  const center = size / 2;

  return (
    <View style={styles.ringWrap}>
      <Animated.View style={[styles.ringLayer, arcStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.chart.track}
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={palette.primary}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${gapLength}`}
            strokeLinecap="round"
            fill="transparent"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius - 20}
            fill={tokens.color.surface.frosted}
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.ringLayer, styles.ringCenter, pipStyle]} pointerEvents="none">
        <Pip state="thinking" size={88} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.regular,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  elapsed: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 14,
    letterSpacing: 0.2,
    marginTop: spacing.xs,
  },
  ringWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
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

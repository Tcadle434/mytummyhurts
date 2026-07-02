import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import {
  AppScreen,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SectionCard,
} from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { isLiveBackendConfigured } from '../../config/env';
import { RootStackParamList } from '../../navigation/types';
import { apiClient } from '../../services/api/client';
import { ApiError } from '../../services/api/errors';
import { useAppStore } from '../../store/useAppStore';
import { spacing, tokens, type } from '../../theme';
import {
  AnalyzingProgressState,
  INITIAL_ANALYZING_PROGRESS,
  applyProgressSnapshot,
  formatIngredientsPreview,
  liveStageCopy,
} from './analyzingProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanAnalyzing'>;

// Staged reassurance: each honest step holds this long, then the copy moves
// on. The last step holds until the result lands — no stopwatch counting up.
// This timed track is the fallback whenever real progress is unavailable.
const STAGE_STEP_SECONDS = 7;

// Real progress: poll the server's stage stamps while the blocking analyze
// request is in flight. Polling is display-only — it never completes or fails
// the scan itself.
const PROGRESS_POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_POLL_FAILURES = 2;

const FOOD_STAGES = [
  'Reading the ingredients…',
  'Checking your history…',
  'Scoring this for you…',
];
const MENU_STAGES = [
  'Reading every dish…',
  'Checking your history…',
  'Ranking the menu for you — menus take the longest.',
];
const GROCERY_STAGES = [
  'Reading the label…',
  'Checking your history…',
  'Scoring this for you…',
];

export function ScanAnalyzingScreen({ navigation, route }: Props) {
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalyzingProgressState>(INITIAL_ANALYZING_PROGRESS);
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

  const scanKind = isMenuScan ? 'menu' : isGroceryScan ? 'grocery' : 'food';
  const stages = isMenuScan ? MENU_STAGES : isGroceryScan ? GROCERY_STAGES : FOOD_STAGES;
  const timedStageIndex = Math.min(Math.floor(elapsed / STAGE_STEP_SECONDS), stages.length - 1);
  // Real stage stamps take over the supporting line as soon as they arrive;
  // until then (or if polling ever fails) the timed copy carries the wait.
  const stageCopy =
    progress.stageIndex !== null ? liveStageCopy(scanKind, progress.stageIndex) : stages[timedStageIndex];
  const foundLine = formatIngredientsPreview(progress.ingredientsPreview);

  useEffect(() => {
    const ticker = setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    let active = true;
    let analyzeSettled = false;

    const requestId = route.params.payload.requestId;
    let pollingStopped = !requestId || !isLiveBackendConfigured;
    let pollInFlight = false;
    let consecutivePollFailures = 0;

    const poller = setInterval(() => {
      if (!active || analyzeSettled || pollingStopped || pollInFlight || !requestId) {
        return;
      }
      pollInFlight = true;
      apiClient
        .getScanProgress({ requestId })
        .then((snapshot) => {
          consecutivePollFailures = 0;
          if (!active || analyzeSettled) {
            return;
          }
          if (snapshot.status === 'completed' || snapshot.status === 'failed') {
            // The blocking analyze request is the source of truth for
            // completion — just stop asking.
            pollingStopped = true;
          }
          setProgress((current) => applyProgressSnapshot(current, snapshot));
        })
        .catch((pollError) => {
          // Progress is display-only: any trouble here quietly leaves the
          // timed copy in charge. A 404 means the server predates the
          // endpoint, so stop immediately; otherwise allow a brief hiccup.
          consecutivePollFailures += 1;
          const isEndpointMissing = pollError instanceof ApiError && pollError.status === 404;
          if (isEndpointMissing || consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            pollingStopped = true;
          }
        })
        .finally(() => {
          pollInFlight = false;
        });
    }, PROGRESS_POLL_INTERVAL_MS);

    void analyzeScanInput(route.params.payload)
      .then((result) => {
        analyzeSettled = true;
        if (!active) {
          return;
        }
        navigation.replace('ScanResult', {
          scanId: result.scanId,
          manualMode: route.params.manualMode,
        });
      })
      .catch((caughtError) => {
        analyzeSettled = true;
        if (!active) {
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : 'The scan could not be completed.');
      });

    return () => {
      active = false;
      clearInterval(ticker);
      clearInterval(poller);
    };
  }, [analyzeScanInput, navigation, route.params]);

  if (error) {
    return (
      <AppScreen>
        <ScreenHeader
          eyebrow="Scan hiccup"
          title={isMenuScan ? "We couldn't read that menu." : isGroceryScan ? "We couldn't read that product." : "We couldn't read that meal."}
          subtitle={error}
        />
        <SectionCard>
          <View style={styles.errorPip}>
            <Pip state="anxious" size={96} />
          </View>
          <Text style={styles.errorBody}>
            {"Nothing was saved — try again whenever you're ready."}
          </Text>
          <PrimaryButton
            label="Try again"
            onPress={() => navigation.replace('ScanCapture', {
              sourceType: route.params.payload.sourceType,
              manualMode: route.params.manualMode,
              scanCategory: route.params.payload.scanCategory,
              initialMode: retryInitialMode,
            })}
          />
          {isGroceryScan ? (
            <SecondaryButton
              label="Snap the ingredient label instead"
              onPress={() => navigation.replace('ScanCapture', {
                sourceType: 'camera',
                manualMode: route.params.manualMode,
                scanCategory: 'food',
                initialMode: 'food',
              })}
            />
          ) : null}
          <SecondaryButton label="Go back" onPress={() => navigation.goBack()} />
        </SectionCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <IndeterminateRing />

      <View style={styles.copy}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle} accessibilityLiveRegion="polite">
          {stageCopy}
        </Text>
        {foundLine ? (
          <Text style={styles.foundLine} accessibilityLiveRegion="polite">
            {foundLine}
          </Text>
        ) : null}
      </View>
    </AppScreen>
  );
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
            stroke={tokens.color.accent.brand}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${gapLength}`}
            strokeLinecap="round"
            fill="transparent"
          />
          {/* Pip's disc is crisp white on porcelain — no frosted haze. */}
          <Circle
            cx={center}
            cy={center}
            r={radius - 20}
            fill={tokens.color.surface.card.default}
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
    ...tokens.type.display.section,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.regular,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  foundLine: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
    textAlign: 'center',
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
  errorPip: {
    alignItems: 'center',
  },
  errorBody: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
});

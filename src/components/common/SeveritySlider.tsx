import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '../../theme';

type SeveritySliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
};

const TRACK_HEIGHT = 14;
const THUMB_SIZE = 30;
const HORIZONTAL_PADDING = THUMB_SIZE / 2;
const POSITION_SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
const GRIP_TIMING = { duration: 140 } as const;
const RELEASE_TIMING = { duration: 220 } as const;

// Sharp band transitions so the color jumps at the tier boundaries instead of
// interpolating through muddy in-between tones (sage → orange would otherwise
// pass through brown). 3/4 boundary lands at 0.35 (3.5/10) and 6/7 at 0.65.
const COLOR_STOPS = [0, 0.34, 0.36, 0.64, 0.66, 1] as const;

export function SeveritySlider({ value, onChange, min = 0, max = 10 }: SeveritySliderProps) {
  const [width, setWidth] = useState(0);
  const range = max - min;
  const usableWidth = Math.max(0, width - HORIZONTAL_PADDING * 2);

  const position = useSharedValue(0);
  const dragging = useSharedValue(0);
  const lastFiredValue = useSharedValue(value);

  useEffect(() => {
    if (usableWidth <= 0) return;
    const target = ((value - min) / range) * usableWidth;
    position.value = withSpring(target, POSITION_SPRING);
    lastFiredValue.value = value;
  }, [lastFiredValue, max, min, position, range, usableWidth, value]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  function fireHaptic() {
    void Haptics.selectionAsync();
  }

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      dragging.value = withTiming(1, GRIP_TIMING);
      const clamped = clamp(event.x - HORIZONTAL_PADDING, 0, usableWidth);
      position.value = clamped;
      const newValue = roundToInteger(clamped, usableWidth, min, range);
      if (newValue !== lastFiredValue.value) {
        lastFiredValue.value = newValue;
        runOnJS(fireHaptic)();
        runOnJS(onChange)(newValue);
      }
    })
    .onChange((event) => {
      'worklet';
      const clamped = clamp(event.x - HORIZONTAL_PADDING, 0, usableWidth);
      position.value = clamped;
      const newValue = roundToInteger(clamped, usableWidth, min, range);
      if (newValue !== lastFiredValue.value) {
        lastFiredValue.value = newValue;
        runOnJS(fireHaptic)();
        runOnJS(onChange)(newValue);
      }
    })
    .onFinalize(() => {
      'worklet';
      dragging.value = withTiming(0, RELEASE_TIMING);
      const snapped = lastFiredValue.value;
      const snappedPosition = ((snapped - min) / range) * usableWidth;
      position.value = withSpring(snappedPosition, POSITION_SPRING);
    });

  const fillStyle = useAnimatedStyle(() => {
    const ratio = usableWidth > 0 ? position.value / usableWidth : 0;
    return {
      width: position.value + HORIZONTAL_PADDING / 2,
      backgroundColor: interpolateColor(ratio, [...COLOR_STOPS], [
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.high.tint,
        tokens.color.status.risk.high.tint,
      ]),
    };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const ratio = usableWidth > 0 ? position.value / usableWidth : 0;
    const scale = 1 + dragging.value * 0.18;
    return {
      transform: [{ translateX: position.value }, { scale }],
      backgroundColor: interpolateColor(ratio, [...COLOR_STOPS], [
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.high.tint,
        tokens.color.status.risk.high.tint,
      ]),
    };
  });

  const haloStyle = useAnimatedStyle(() => {
    const ratio = usableWidth > 0 ? position.value / usableWidth : 0;
    return {
      opacity: dragging.value * 0.22,
      transform: [{ translateX: position.value }, { scale: 1 + dragging.value * 0.6 }],
      backgroundColor: interpolateColor(ratio, [...COLOR_STOPS], [
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.low.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.medium.tint,
        tokens.color.status.risk.high.tint,
        tokens.color.status.risk.high.tint,
      ]),
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.wrap} onLayout={handleLayout}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function roundToInteger(position: number, usableWidth: number, min: number, range: number) {
  'worklet';
  if (usableWidth <= 0) return min;
  return Math.round(min + (position / usableWidth) * range);
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: tokens.color.chart.track,
  },
  fill: {
    position: 'absolute',
    left: HORIZONTAL_PADDING / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (THUMB_SIZE + 8 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    borderColor: tokens.color.utility.white,
    shadowColor: tokens.color.utility.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  halo: {
    position: 'absolute',
    left: 0,
    top: (THUMB_SIZE + 8 - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
});

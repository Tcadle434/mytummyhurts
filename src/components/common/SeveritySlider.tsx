import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityActionEvent, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
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
  accessibilityLabel?: string;
};

const TRACK_HEIGHT = 14;
const THUMB_SIZE = 30;
const HORIZONTAL_PADDING = THUMB_SIZE / 2;
const CONTROL_HEIGHT = THUMB_SIZE + 8;
const BUBBLE_WIDTH = 44;
const BUBBLE_HEIGHT = 30;
const BUBBLE_GAP = 8;
const WRAP_HEIGHT = BUBBLE_HEIGHT + BUBBLE_GAP + CONTROL_HEIGHT;
const TRACK_BOTTOM = (CONTROL_HEIGHT - TRACK_HEIGHT) / 2;
const THUMB_TOP = BUBBLE_HEIGHT + BUBBLE_GAP + (CONTROL_HEIGHT - THUMB_SIZE) / 2;
const TICK_INSET = 3;
const POSITION_SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;
const GRIP_TIMING = { duration: 140 } as const;
const RELEASE_TIMING = { duration: 220 } as const;

// Sharp band transitions so the color jumps at the tier boundaries instead of
// interpolating through muddy in-between tones (sage → orange would otherwise
// pass through brown). 3/4 boundary lands at 0.35 (3.5/10) and 6/7 at 0.65.
const COLOR_STOPS = [0, 0.34, 0.36, 0.64, 0.66, 1] as const;

// The two boundaries above, marked on the track so "what's a 5?" has anchors.
const BAND_BOUNDARY_RATIOS = [0.35, 0.65] as const;

const ACCESSIBILITY_ACTIONS = [{ name: 'increment' as const }, { name: 'decrement' as const }];

export function SeveritySlider({
  value,
  onChange,
  min = 0,
  max = 10,
  accessibilityLabel = 'How your gut felt, from 0 no symptoms to 10 worst symptoms',
}: SeveritySliderProps) {
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

  function handleAccessibilityAction(event: AccessibilityActionEvent) {
    const actionName = event.nativeEvent.actionName;
    const direction = actionName === 'increment' ? 1 : actionName === 'decrement' ? -1 : 0;
    if (direction === 0) return;
    const next = Math.max(min, Math.min(max, value + direction));
    if (next !== value) {
      onChange(next);
    }
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

  // The finger covers the thumb during a drag, so the live value floats above
  // it. Ink surface + inverse text keeps the numeral readable in every band.
  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: dragging.value,
    transform: [
      { translateX: position.value + HORIZONTAL_PADDING - BUBBLE_WIDTH / 2 },
      { translateY: (1 - dragging.value) * 4 },
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={styles.wrap}
        onLayout={handleLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          min,
          max,
          now: value,
          text: `${value} out of ${max}, ${severityBandWord(value)}`,
        }}
        accessibilityActions={ACCESSIBILITY_ACTIONS}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
        {usableWidth > 0
          ? BAND_BOUNDARY_RATIOS.map((ratio) => (
              <View
                key={ratio}
                pointerEvents="none"
                style={[styles.tick, { left: HORIZONTAL_PADDING + ratio * usableWidth - 1 }]}
              />
            ))
          : null}
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none" />
        <Animated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
        <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none">
          <Text style={styles.bubbleLabel}>{value}</Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function severityBandWord(value: number) {
  if (value <= 3) return 'calm';
  if (value <= 6) return 'mixed';
  return 'rough';
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
    height: WRAP_HEIGHT,
    justifyContent: 'flex-end',
  },
  track: {
    position: 'absolute',
    left: HORIZONTAL_PADDING,
    right: HORIZONTAL_PADDING,
    bottom: TRACK_BOTTOM,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: tokens.color.chart.track,
  },
  fill: {
    position: 'absolute',
    left: HORIZONTAL_PADDING / 2,
    bottom: TRACK_BOTTOM,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  tick: {
    position: 'absolute',
    bottom: TRACK_BOTTOM + TICK_INSET,
    width: 2,
    height: TRACK_HEIGHT - TICK_INSET * 2,
    borderRadius: 1,
    backgroundColor: tokens.color.utility.white,
    opacity: 0.85,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: THUMB_TOP,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    borderColor: tokens.color.utility.white,
    // Green-cast lift, matching the card shadow system.
    shadowColor: tokens.shadow.card.shadowColor,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  halo: {
    position: 'absolute',
    left: 0,
    top: THUMB_TOP,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  bubble: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.text.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.text.inverse,
  },
});

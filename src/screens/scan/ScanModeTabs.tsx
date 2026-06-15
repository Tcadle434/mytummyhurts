import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { palette, radii, type } from '../../theme';

export type ScanModeTab<T extends string> = {
  key: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
};

const INACTIVE_COLOR = 'rgba(255, 255, 255, 0.6)';
const SLIDE_TIMING = { duration: 240, easing: Easing.out(Easing.cubic) } as const;

export function ScanModeTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: ScanModeTab<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value),
  );
  const segmentWidth = trackWidth > 0 ? trackWidth / tabs.length : 0;

  const position = useSharedValue(activeIndex);
  useEffect(() => {
    position.value = withTiming(activeIndex, SLIDE_TIMING);
  }, [activeIndex, position]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * segmentWidth }],
  }));

  return (
    <View style={styles.track}>
      <View
        style={styles.segments}
        onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, { width: segmentWidth }, indicatorStyle]}
          />
        ) : null}
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected, disabled: tab.disabled }}
              disabled={tab.disabled}
              onPress={() => onChange(tab.key)}
              style={[styles.segment, tab.disabled && styles.segmentDisabled]}
            >
              <Ionicons name={tab.icon} size={15} color={selected ? palette.white : INACTIVE_COLOR} />
              <Text
                numberOfLines={1}
                style={[styles.segmentLabel, selected && styles.segmentLabelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(14, 18, 16, 0.55)',
    padding: 4,
  },
  segments: {
    position: 'relative',
    flexDirection: 'row',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  segmentDisabled: {
    opacity: 0.4,
  },
  segmentLabel: {
    color: INACTIVE_COLOR,
    fontFamily: type.body.bold,
    fontSize: 13,
  },
  segmentLabelActive: {
    color: palette.white,
  },
});

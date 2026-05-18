import { ReactNode, useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { components, spacing } from '../../theme';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
const SETTLE_SPRING = { damping: 22, stiffness: 240, mass: 0.8 } as const;
const DISMISS_TIMING = { duration: 200 } as const;

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [translateY, visible]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-12, 12])
    .onChange((event) => {
      'worklet';
      const next = Math.max(0, translateY.value + event.changeY);
      translateY.value = next;
    })
    .onEnd((event) => {
      'worklet';
      const shouldDismiss =
        translateY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;

      if (shouldDismiss) {
        translateY.value = withTiming(translateY.value + 600, DISMISS_TIMING, () => {
          runOnJS(onClose)();
        });
        return;
      }

      translateY.value = withSpring(0, SETTLE_SPRING);
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
            <View style={styles.handle} />
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: components.bottomSheet.backdrop,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...components.bottomSheet.shell,
    gap: spacing.md,
  },
  handle: {
    ...components.bottomSheet.handle,
    alignSelf: 'center',
  },
});

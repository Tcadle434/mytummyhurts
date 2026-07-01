import { useEffect, useMemo } from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Pip } from '../../components/common/Pip';
import { verdictTone } from '../../components/common/UI';
import { radii, spacing, tokens, type } from '../../theme';
import {
  buildCelebrationShareText,
  type ClearedCelebrationCandidate,
} from './clearedCelebration';

const PETAL_COUNT = 10;
const PETAL_DISTANCE = 130;
const PETAL_DURATION_MS = 950;
const PETAL_STAGGER_MS = 28;

// Organic burst instead of confetti: small petals in the garden palette
// (cleared green, Pip mint, peach) drifting outward and fading. One shot,
// then still — celebration, not a carnival.
function Petal({ index, active }: { index: number; active: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        180 + index * PETAL_STAGGER_MS,
        withTiming(1, { duration: PETAL_DURATION_MS, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [active, index, progress]);

  const angle = (index / PETAL_COUNT) * Math.PI * 2 - Math.PI / 2;
  const distance = PETAL_DISTANCE * (index % 2 === 0 ? 1 : 0.72);
  const colors = [
    verdictTone('cleared').tint,
    tokens.color.accent.mascot,
    tokens.color.accent.mascotAccent,
  ];
  const color = colors[index % colors.length]!;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value < 0.15 ? progress.value / 0.15 : 1 - Math.max(0, progress.value - 0.55) / 0.45,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value - 18 * progress.value },
      { rotate: `${progress.value * (index % 2 === 0 ? 150 : -130)}deg` },
      { scale: 0.7 + progress.value * 0.5 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.petal, { backgroundColor: color }, animatedStyle]}
    />
  );
}

export function ClearedCelebrationModal({
  candidate,
  onClose,
  onShare,
}: {
  candidate: ClearedCelebrationCandidate | null;
  onClose: () => void;
  onShare?: () => void;
}) {
  const visible = candidate !== null;
  const pipScale = useSharedValue(0.4);
  const cardOpacity = useSharedValue(0);
  const cardShift = useSharedValue(24);
  const tone = verdictTone('cleared');

  useEffect(() => {
    if (visible) {
      cardOpacity.value = 0;
      cardShift.value = 24;
      pipScale.value = 0.4;
      cardOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
      cardShift.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
      pipScale.value = withDelay(140, withSpring(1, { damping: 11, stiffness: 160 }));
    }
  }, [cardOpacity, cardShift, pipScale, visible]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardShift.value }],
  }));
  const pipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pipScale.value }],
  }));

  const petals = useMemo(() => Array.from({ length: PETAL_COUNT }, (_, index) => index), []);

  async function handleShare() {
    if (!candidate) return;
    try {
      await Share.share({ message: buildCelebrationShareText(candidate) });
      onShare?.();
    } catch {
      // Sharing is a bonus; a cancelled sheet is not an error worth surfacing.
    }
  }

  if (!candidate) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim} accessibilityViewIsModal>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.burstStage} pointerEvents="none">
            {petals.map((index) => (
              <Petal key={index} index={index} active={visible} />
            ))}
          </View>

          <Animated.View style={pipStyle}>
            <Pip state="joy" size={104} />
          </Animated.View>

          <View style={[styles.verdictBadge, { backgroundColor: tone.background }]}>
            <Text style={[styles.verdictBadgeLabel, { color: tone.foreground }]}>Case closed</Text>
          </View>

          <Text style={styles.headline}>
            {candidate.emoji ? `${candidate.emoji} ` : ''}
            {candidate.label} — cleared
          </Text>

          <Text style={styles.evidence}>{candidate.evidenceLine}.</Text>
          {candidate.memberSummary ? (
            <Text style={styles.members} numberOfLines={2}>
              Covers {candidate.memberSummary}
            </Text>
          ) : null}
          <Text style={styles.reassurance}>You can stop worrying about this one.</Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share that ${candidate.label} is cleared`}
              onPress={() => void handleShare()}
              style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.secondaryActionLabel}>Share it</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep going"
              onPress={onClose}
              style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.primaryActionLabel}>Keep going</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: tokens.color.overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: tokens.color.surface.card.default,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...tokens.shadow.modal,
  },
  burstStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petal: {
    position: 'absolute',
    width: 12,
    height: 18,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
  },
  verdictBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  verdictBadgeLabel: {
    ...tokens.type.label.chip,
    letterSpacing: 0.3,
  },
  headline: {
    ...tokens.type.display.section,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  evidence: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  members: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
    textAlign: 'center',
  },
  reassurance: {
    ...tokens.type.body.strong,
    color: verdictTone('cleared').foreground,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.strong,
    backgroundColor: tokens.color.surface.card.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionLabel: {
    ...tokens.type.label.button,
    color: tokens.color.text.primary,
  },
  primaryAction: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.action.primary.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.primary.foreground,
  },
});

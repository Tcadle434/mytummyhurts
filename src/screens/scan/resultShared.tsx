import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { palette, radii, spacing, tokens, type } from '../../theme';
import { SkeletonBlock } from '../../components/common/UI';
import type { ScanIngredient } from '../../components/scan-result/ScanResultCards';
import type { ScanIngredientRisk } from '../../types/domain';

export function ConsumeChoice({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.consumeChoice, active && styles.consumeChoiceActive, pressed && { opacity: 0.88 }]}
    >
      <Ionicons name={icon} size={16} color={active ? palette.primaryDark : palette.textMuted} />
      <Text style={[styles.consumeChoiceText, active && { color: palette.primaryDark }]}>{label}</Text>
    </Pressable>
  );
}

export function DeleteAction({ onPress, isDeleting }: { onPress: () => void; isDeleting: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isDeleting}
      style={({ pressed }) => [styles.deleteAction, (pressed || isDeleting) && { opacity: pressed ? 0.7 : 0.5 }]}
    >
      <Text style={styles.deleteActionLabel}>{isDeleting ? 'Deleting…' : 'Delete'}</Text>
    </Pressable>
  );
}

export function toScanIngredient(ingredient: ScanIngredientRisk): ScanIngredient {
  return {
    name: ingredient.rawName || ingredient.canonicalName,
    level: ingredient.riskLevel,
  };
}



export function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Placeholder shown while the result image loads (or when a scan has no image).
// A calm skeleton fills the slot — better than a letter that flashes before the photo.
export function ResultImageFallback() {
  return <SkeletonBlock width="100%" height="100%" radius={18} />;
}

export const sharedResultStyles = StyleSheet.create({
  heroSlotImage: {
    width: 64,
    height: 64,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  sectionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  disclaimerText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.regular,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  actionStack: {
    gap: spacing.sm,
  },
});

const styles = StyleSheet.create({
  consumeChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
  },
  consumeChoiceActive: {
    borderColor: palette.primary,
    backgroundColor: tokens.color.surface.card.success,
  },
  consumeChoiceText: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  deleteAction: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionLabel: {
    color: palette.danger,
    fontFamily: type.body.semibold,
    fontSize: 16,
    letterSpacing: 0.1,
  },
});

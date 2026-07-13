import type { ReactNode } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, tokens, type } from '../../theme';

type SettingsSectionGroupProps = {
  label: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
};

export function SettingsSectionGroup({
  label,
  children,
  onLayout,
}: SettingsSectionGroupProps) {
  return (
    <View style={styles.groupBlock} onLayout={onLayout}>
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupBlock: {
    gap: spacing.xs,
  },
  groupLabel: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
  },
  groupCard: {
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.default,
    ...tokens.shadow.card,
  },
});

import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing, tokens, type } from '../../theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type SettingsRowProps = {
  icon: IoniconName;
  label: string;
  value?: string;
  badge?: string;
  onPress: () => void;
  expanded?: boolean;
  danger?: boolean;
};

export function SettingsRow({
  icon,
  label,
  value,
  badge,
  onPress,
  expanded,
  danger,
}: SettingsRowProps) {
  const accessibilityLabel = [label, value ?? badge].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? tokens.color.status.danger.foreground : palette.primary}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>
          {label}
        </Text>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeLabel}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-forward'}
        size={18}
        color={tokens.color.icon.muted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    opacity: 0.78,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: tokens.color.status.danger.background,
  },
  rowCopy: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    color: tokens.color.text.primary,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  rowLabelDanger: {
    color: tokens.color.status.danger.foreground,
  },
  rowValue: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  rowBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.status.success.background,
  },
  rowBadgeLabel: {
    color: tokens.color.text.accent,
    fontFamily: type.body.bold,
    fontSize: 11,
    lineHeight: 14,
  },
});

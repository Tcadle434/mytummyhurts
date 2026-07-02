import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';

import { components, spacing, tokens } from '../../../theme';
import { withAlpha } from '../../../theme/helpers';

export const PICKER_PRESS_SPRING = { damping: 16, stiffness: 360, mass: 0.6 } as const;
export const PICKER_RELEASE_SPRING = { damping: 14, stiffness: 220, mass: 0.7 } as const;
export const PICKER_POP_UP_SPRING = { damping: 11, stiffness: 280, mass: 0.55 } as const;

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type CardVariant = 'default' | 'warm' | 'success' | 'info';

export type InfoPillTone =
  | 'default'
  | 'soft'
  | 'warm'
  | 'info'
  | 'danger'
  | 'riskLow'
  | 'riskMedium'
  | 'riskHigh';

export type OnboardingPickerVariant = 'image' | 'plain';

const sharedStyles = StyleSheet.create({
  sectionCard: {
    ...components.card.default,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardWarm: {
    ...components.card.warm,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardSuccess: {
    ...components.card.success,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardInfo: {
    ...components.card.info,
    padding: spacing.lg,
    gap: spacing.md,
  },
});

export function getCardStyle(variant: CardVariant) {
  if (variant === 'warm') return sharedStyles.sectionCardWarm;
  if (variant === 'success') return sharedStyles.sectionCardSuccess;
  if (variant === 'info') return sharedStyles.sectionCardInfo;
  return sharedStyles.sectionCard;
}

export function getPillStyle(tone: InfoPillTone) {
  switch (tone) {
    case 'soft':
      return {
        backgroundColor: components.badge.soft.backgroundColor,
        color: components.badge.soft.foreground,
      };
    case 'warm':
      return {
        backgroundColor: components.badge.warm.backgroundColor,
        color: components.badge.warm.foreground,
      };
    case 'info':
      return {
        backgroundColor: components.badge.info.backgroundColor,
        color: components.badge.info.foreground,
      };
    case 'danger':
      return {
        backgroundColor: components.badge.danger.background,
        color: components.badge.danger.foreground,
      };
    case 'riskLow':
      return {
        backgroundColor: components.badge.risk.low.background,
        color: components.badge.risk.low.foreground,
      };
    case 'riskMedium':
      return {
        backgroundColor: components.badge.risk.medium.background,
        color: components.badge.risk.medium.foreground,
      };
    case 'riskHigh':
      return {
        backgroundColor: components.badge.risk.high.background,
        color: components.badge.risk.high.foreground,
      };
    default:
      return {
        backgroundColor: components.badge.default.backgroundColor,
        color: components.badge.default.foreground,
      };
  }
}

export function getOnboardingPickerColorPair(variant: OnboardingPickerVariant) {
  if (variant === 'image') {
    return {
      backgroundFrom: withAlpha(tokens.color.utility.white, 0.94),
      backgroundTo: tokens.color.accent.brand,
      borderFrom: tokens.color.border.subtle,
      borderTo: tokens.color.accent.brand,
    };
  }

  return {
    backgroundFrom: tokens.color.surface.card.default,
    backgroundTo: tokens.color.status.success.background,
    borderFrom: tokens.color.border.subtle,
    borderTo: tokens.color.border.emphasis,
  };
}

export function getOnboardingPickerColors(variant: OnboardingPickerVariant, selected: boolean) {
  if (variant === 'image') {
    return {
      background: selected ? tokens.color.accent.brand : withAlpha(tokens.color.utility.white, 0.94),
      border: selected ? tokens.color.accent.brand : tokens.color.border.subtle,
      text: selected ? tokens.color.text.inverse : tokens.color.text.primary,
      icon: selected ? tokens.color.text.inverse : tokens.color.icon.primary,
      iconBackground: selected
        ? withAlpha(tokens.color.utility.white, 0.18)
        : tokens.color.status.success.background,
      badgeBackground: selected
        ? withAlpha(tokens.color.utility.white, 0.18)
        : tokens.color.accent.brand,
      badgeText: tokens.color.text.inverse,
    };
  }

  return {
    background: selected ? tokens.color.status.success.background : tokens.color.surface.card.default,
    border: selected ? tokens.color.border.emphasis : tokens.color.border.subtle,
    text: selected ? tokens.color.status.success.foreground : tokens.color.text.primary,
    icon: selected ? tokens.color.status.success.foreground : tokens.color.icon.primary,
    iconBackground: selected
      ? withAlpha(tokens.color.accent.brand, 0.12)
      : tokens.color.surface.card.warm,
    badgeBackground: tokens.color.accent.brand,
    badgeText: tokens.color.text.inverse,
  };
}

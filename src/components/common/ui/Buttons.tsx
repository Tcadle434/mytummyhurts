import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { components, tokens } from '../../../theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={[styles.primaryButtonLabel, disabled && styles.primaryButtonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, (pressed || disabled) && { opacity: pressed ? 0.88 : 0.5 }]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function GreenOutlineButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.quietButton, (pressed || disabled) && { opacity: pressed ? 0.88 : 0.5 }]}
    >
      <Text style={styles.quietButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function AvatarButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.82 }]}>
      <Ionicons name="person-outline" size={18} color={tokens.color.icon.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    ...components.button.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: tokens.color.chart.track,
    elevation: 0,
    shadowOpacity: 0,
  },
  primaryButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.primary.foreground,
  },
  primaryButtonLabelDisabled: {
    color: tokens.color.text.tertiary,
  },
  secondaryButton: {
    ...components.button.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.secondary.foreground,
  },
  quietButton: {
    ...components.button.quiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.quiet.foreground,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

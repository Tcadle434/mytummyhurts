import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { components, radii, spacing, tokens, type } from '../../../theme';
import {
  IoniconName,
  OnboardingPickerVariant,
  PICKER_POP_UP_SPRING,
  PICKER_PRESS_SPRING,
  PICKER_RELEASE_SPRING,
  getOnboardingPickerColorPair,
  getOnboardingPickerColors,
} from './shared';

type InputFieldProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  autoFocus?: TextInputProps['autoFocus'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
  textContentType?: TextInputProps['textContentType'];
};

type OptionChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

type OnboardingPickerOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconName?: IoniconName;
  badgeText?: string;
  variant?: OnboardingPickerVariant;
};

export function OptionChip({ label, selected, onPress }: OptionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.optionChip, selected && styles.optionChipSelected, pressed && { opacity: 0.84 }]}
    >
      <Text style={[styles.optionChipLabel, selected && styles.optionChipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingPickerOption({
  label,
  selected,
  onPress,
  iconName,
  badgeText,
  variant = 'plain',
}: OnboardingPickerOptionProps) {
  const colors = getOnboardingPickerColors(variant, selected);
  const pair = getOnboardingPickerColorPair(variant);
  const selectedness = useSharedValue(selected ? 1 : 0);
  const scale = useSharedValue(1);
  const previousSelectedRef = useRef(selected);

  useEffect(() => {
    selectedness.value = withTiming(selected ? 1 : 0, { duration: 220 });
    if (!previousSelectedRef.current && selected) {
      scale.value = withSequence(
        withSpring(1.04, PICKER_POP_UP_SPRING),
        withSpring(1, PICKER_RELEASE_SPRING),
      );
    }
    previousSelectedRef.current = selected;
  }, [selected, selectedness, scale]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selectedness.value,
      [0, 1],
      [pair.backgroundFrom, pair.backgroundTo],
    ),
    borderColor: interpolateColor(
      selectedness.value,
      [0, 1],
      [pair.borderFrom, pair.borderTo],
    ),
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, PICKER_PRESS_SPRING);
  }

  function handlePressOut() {
    if (!selected) {
      scale.value = withSpring(1, PICKER_RELEASE_SPRING);
    }
  }

  function handlePress() {
    void Haptics.selectionAsync();
    onPress();
  }

  return (
    <Animated.View style={[styles.onboardingPickerOption, containerStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.onboardingPickerHit}
      >
        {iconName ? (
          <View
            style={[styles.onboardingPickerIconSlot, { backgroundColor: colors.iconBackground }]}
          >
            <Ionicons name={iconName} size={16} color={colors.icon} />
          </View>
        ) : null}
        <View style={styles.onboardingPickerLabelWrap}>
          <Text
            numberOfLines={2}
            style={[
              styles.onboardingPickerLabel,
              {
                color: colors.text,
                flex: badgeText ? 0 : 1,
                textAlign: 'left',
              },
            ]}
          >
            {label}
          </Text>
          {badgeText ? (
            <View
              style={[styles.onboardingPickerBadge, { backgroundColor: colors.badgeBackground }]}
            >
              <Text style={[styles.onboardingPickerBadgeLabel, { color: colors.badgeText }]}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function InputField({
  value,
  placeholder,
  onChangeText,
  multiline,
  autoFocus,
  autoCapitalize,
  autoComplete,
  keyboardType,
  secureTextEntry,
  textContentType,
}: InputFieldProps) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={tokens.color.text.tertiary}
      onChangeText={onChangeText}
      multiline={multiline}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      textContentType={textContentType}
      style={[styles.input, multiline && styles.inputMultiline]}
    />
  );
}

const styles = StyleSheet.create({
  optionChip: {
    ...components.chip.option,
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: tokens.color.border.strong,
  },
  optionChipSelected: {
    ...components.chip.optionSelected,
  },
  optionChipLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.text.primary,
  },
  optionChipLabelSelected: {
    color: tokens.color.text.inverse,
  },
  onboardingPickerOption: {
    width: '100%',
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    ...tokens.shadow.card,
  },
  onboardingPickerHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  onboardingPickerBadge: {
    minWidth: 28,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginTop: -7,
  },
  onboardingPickerBadgeLabel: {
    fontFamily: type.body.bold,
    fontSize: 12,
    lineHeight: 14,
  },
  onboardingPickerIconSlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingPickerLabel: {
    ...tokens.type.body.strong,
  },
  onboardingPickerLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  input: {
    ...components.input,
    paddingHorizontal: spacing.md,
    color: tokens.color.text.primary,
    fontFamily: type.body.regular,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 64,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
});

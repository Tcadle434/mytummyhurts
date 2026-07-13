import { StyleSheet, View } from 'react-native';

import { OnboardingPickerOption, PrimaryButton } from '../../components/common/UI';
import { spacing } from '../../theme';
import { SettingsExpandedBlock } from './SettingsExpandedBlock';

type SettingsHealthListPickerProps = {
  options: readonly string[];
  selectedValues: string[];
  customValueCount: number;
  saveLabel: string;
  isSaving: boolean;
  disabled: boolean;
  onValuesChange: (values: string[]) => void;
  onOpenCustom: () => void;
  onSave: () => void | Promise<void>;
};

export function SettingsHealthListPicker({
  options,
  selectedValues,
  customValueCount,
  saveLabel,
  isSaving,
  disabled,
  onValuesChange,
  onOpenCustom,
  onSave,
}: SettingsHealthListPickerProps) {
  function toggleValue(value: string) {
    onValuesChange(
      selectedValues.includes(value)
        ? selectedValues.filter((entry) => entry !== value)
        : [...selectedValues, value],
    );
  }

  return (
    <SettingsExpandedBlock>
      <View style={styles.pickerStack}>
        {options.map((option) => (
          <OnboardingPickerOption
            key={option}
            label={option}
            variant="plain"
            selected={selectedValues.includes(option)}
            onPress={() => toggleValue(option)}
          />
        ))}
        <OnboardingPickerOption
          label="Other"
          variant="plain"
          selected={false}
          badgeText={customValueCount > 0 ? `+${customValueCount}` : undefined}
          onPress={onOpenCustom}
        />
      </View>
      <PrimaryButton
        label={isSaving ? 'Saving…' : saveLabel}
        onPress={() => void onSave()}
        disabled={disabled}
      />
    </SettingsExpandedBlock>
  );
}

const styles = StyleSheet.create({
  pickerStack: {
    gap: spacing.xs,
  },
});

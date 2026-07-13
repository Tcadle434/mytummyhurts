import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import {
  InfoPill,
  OnboardingPickerOption,
  PrimaryButton,
} from '../../components/common/UI';
import { CustomEntryModal } from '../../components/modals/CustomEntryModal';
import {
  conditionOptions,
  dietPreferenceLabelFromKey,
  dietPreferenceOptions,
  ingredientSensitivityOptions,
  symptomOptions,
} from '../../data/catalog';
import type { SettingsSection } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import type { ProfileUpdateRequest } from '../../services/api/contracts';
import { spacing, tokens, type } from '../../theme';
import type { UserProfile } from '../../types/domain';
import { SettingsExpandedBlock } from './SettingsExpandedBlock';
import { SettingsHealthListPicker } from './SettingsHealthListPicker';
import { SettingsRow } from './SettingsRow';
import { SettingsRowDivider } from './SettingsRowDivider';
import { SettingsSectionGroup } from './SettingsSectionGroup';
import {
  splitByCatalog,
  summarizeDietPreferences,
  summarizeHealthList,
} from './settingsFormatting';
import {
  CUSTOM_CATEGORY_COPY,
  type CustomCategory,
} from './settingsOptions';
import type {
  BusySettingsSection,
  ExpandedSettingsSection,
  SettingsStatusFeedback,
} from './settingsTypes';

type SettingsHealthProfileSectionProps = {
  profile: UserProfile | null;
  expandedSection: ExpandedSettingsSection;
  busySection: BusySettingsSection;
  status: SettingsStatusFeedback | null;
  updateProfileSettings: (request: ProfileUpdateRequest) => Promise<void>;
  setExpandedSection: Dispatch<SetStateAction<ExpandedSettingsSection>>;
  setBusySection: Dispatch<SetStateAction<BusySettingsSection>>;
  setStatus: Dispatch<SetStateAction<SettingsStatusFeedback | null>>;
  onLayout: (event: LayoutChangeEvent) => void;
};

export function SettingsHealthProfileSection({
  profile,
  expandedSection,
  busySection,
  status,
  updateProfileSettings,
  setExpandedSection,
  setBusySection,
  setStatus,
  onLayout,
}: SettingsHealthProfileSectionProps) {
  const [selectedConditions, setSelectedConditions] = useState<string[]>(() =>
    splitByCatalog(profile?.knownConditions ?? [], conditionOptions).predefined,
  );
  const [customConditions, setCustomConditions] = useState<string[]>(() =>
    splitByCatalog(profile?.knownConditions ?? [], conditionOptions).custom,
  );
  const [selectedSensitivities, setSelectedSensitivities] = useState<string[]>(() =>
    splitByCatalog(profile?.knownIngredientSensitivities ?? [], ingredientSensitivityOptions)
      .predefined,
  );
  const [customSensitivities, setCustomSensitivities] = useState<string[]>(() =>
    splitByCatalog(profile?.knownIngredientSensitivities ?? [], ingredientSensitivityOptions)
      .custom,
  );
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(() =>
    splitByCatalog(profile?.commonSymptoms ?? [], symptomOptions).predefined,
  );
  const [customSymptoms, setCustomSymptoms] = useState<string[]>(() =>
    splitByCatalog(profile?.commonSymptoms ?? [], symptomOptions).custom,
  );
  const [selectedDietKeys, setSelectedDietKeys] = useState(() =>
    (profile?.dietPreferences ?? []).map((preference) => preference.key),
  );
  const [customModalCategory, setCustomModalCategory] = useState<CustomCategory | null>(null);
  const [customEntry, setCustomEntry] = useState('');

  useEffect(() => {
    const conditionsSplit = splitByCatalog(profile?.knownConditions ?? [], conditionOptions);
    setSelectedConditions(conditionsSplit.predefined);
    setCustomConditions(conditionsSplit.custom);
    const sensitivitiesSplit = splitByCatalog(
      profile?.knownIngredientSensitivities ?? [],
      ingredientSensitivityOptions,
    );
    setSelectedSensitivities(sensitivitiesSplit.predefined);
    setCustomSensitivities(sensitivitiesSplit.custom);
    const symptomsSplit = splitByCatalog(profile?.commonSymptoms ?? [], symptomOptions);
    setSelectedSymptoms(symptomsSplit.predefined);
    setCustomSymptoms(symptomsSplit.custom);
    setSelectedDietKeys((profile?.dietPreferences ?? []).map((preference) => preference.key));
  }, [
    profile?.commonSymptoms,
    profile?.dietPreferences,
    profile?.knownConditions,
    profile?.knownIngredientSensitivities,
  ]);

  function toggleSection(section: SettingsSection) {
    setExpandedSection((current) => (current === section ? null : section));
  }

  async function saveHealthProfileSection(
    section: Exclude<BusySettingsSection, null>,
    noun: string,
    update: ProfileUpdateRequest,
    countKey: string,
    count: number,
  ) {
    setBusySection(section);
    setStatus(null);
    try {
      await updateProfileSettings(update);
      trackEvent('profile_saved', { [countKey]: count });
      setStatus({ placement: 'health', message: `${noun} saved.`, tone: 'soft' });
      setExpandedSection(null);
    } catch (error) {
      setStatus({
        placement: 'health',
        message: error instanceof Error ? error.message : `${noun} could not be saved.`,
        tone: 'warm',
      });
    } finally {
      setBusySection(null);
    }
  }

  function handleSaveConditions() {
    const merged = [...selectedConditions, ...customConditions];
    return saveHealthProfileSection(
      'conditions',
      'Conditions',
      { knownConditions: merged },
      'conditions_count',
      merged.length,
    );
  }

  function handleSaveSensitivities() {
    const merged = [...selectedSensitivities, ...customSensitivities];
    return saveHealthProfileSection(
      'sensitivities',
      'Sensitivities',
      { knownIngredientSensitivities: merged },
      'sensitivities_count',
      merged.length,
    );
  }

  function handleSaveSymptoms() {
    const merged = [...selectedSymptoms, ...customSymptoms];
    return saveHealthProfileSection(
      'symptoms',
      'Symptoms',
      { commonSymptoms: merged },
      'symptoms_count',
      merged.length,
    );
  }

  async function handleSaveDiet() {
    setBusySection('diet');
    setStatus(null);
    try {
      await updateProfileSettings({
        dietPreferences: selectedDietKeys.map((key) => ({
          key,
          label: dietPreferenceLabelFromKey(key),
          strictness: 'standard',
          source: 'settings',
        })),
      });
      trackEvent('diet_preferences_saved', {
        diet_count: selectedDietKeys.length,
      });
      setStatus({ placement: 'health', message: 'Diet goal saved.', tone: 'soft' });
      setExpandedSection(null);
    } catch (error) {
      setStatus({
        placement: 'health',
        message: error instanceof Error ? error.message : 'Diet goal could not be saved.',
        tone: 'warm',
      });
    } finally {
      setBusySection(null);
    }
  }

  function openCustomModal(category: CustomCategory) {
    setCustomModalCategory(category);
    setCustomEntry('');
  }

  function closeCustomModal() {
    setCustomModalCategory(null);
    setCustomEntry('');
  }

  function addCustomEntry() {
    const trimmed = customEntry.trim();
    if (!trimmed || !customModalCategory) return;
    const normalized = trimmed.toLowerCase();

    if (customModalCategory === 'conditions') {
      const exists = customConditions.some((value) => value.toLowerCase() === normalized);
      if (!exists) setCustomConditions((current) => [...current, trimmed]);
    } else if (customModalCategory === 'sensitivities') {
      const exists = customSensitivities.some((value) => value.toLowerCase() === normalized);
      if (!exists) setCustomSensitivities((current) => [...current, trimmed]);
    } else if (customModalCategory === 'symptoms') {
      const exists = customSymptoms.some((value) => value.toLowerCase() === normalized);
      if (!exists) setCustomSymptoms((current) => [...current, trimmed]);
    }

    setCustomEntry('');
  }

  function removeCustomEntry(category: CustomCategory, value: string) {
    if (category === 'conditions') {
      setCustomConditions((current) => current.filter((entry) => entry !== value));
    } else if (category === 'sensitivities') {
      setCustomSensitivities((current) => current.filter((entry) => entry !== value));
    } else {
      setCustomSymptoms((current) => current.filter((entry) => entry !== value));
    }
  }

  function customValuesForModal(category: CustomCategory) {
    if (category === 'conditions') return customConditions;
    if (category === 'sensitivities') return customSensitivities;
    return customSymptoms;
  }

  return (
    <>
      <SettingsSectionGroup label="Health profile" onLayout={onLayout}>
        <SettingsRow
          icon="medkit-outline"
          label="Conditions"
          value={summarizeHealthList(profile?.knownConditions)}
          expanded={expandedSection === 'conditions'}
          onPress={() => toggleSection('conditions')}
        />
        {expandedSection === 'conditions' ? (
          <SettingsHealthListPicker
            options={conditionOptions}
            selectedValues={selectedConditions}
            customValueCount={customConditions.length}
            saveLabel="Save conditions"
            isSaving={busySection === 'conditions'}
            disabled={busySection !== null}
            onValuesChange={setSelectedConditions}
            onOpenCustom={() => openCustomModal('conditions')}
            onSave={handleSaveConditions}
          />
        ) : null}

        <SettingsRowDivider />

        <SettingsRow
          icon="alert-circle-outline"
          label="Sensitivities"
          value={summarizeHealthList(profile?.knownIngredientSensitivities)}
          expanded={expandedSection === 'sensitivities'}
          onPress={() => toggleSection('sensitivities')}
        />
        {expandedSection === 'sensitivities' ? (
          <SettingsHealthListPicker
            options={ingredientSensitivityOptions}
            selectedValues={selectedSensitivities}
            customValueCount={customSensitivities.length}
            saveLabel="Save sensitivities"
            isSaving={busySection === 'sensitivities'}
            disabled={busySection !== null}
            onValuesChange={setSelectedSensitivities}
            onOpenCustom={() => openCustomModal('sensitivities')}
            onSave={handleSaveSensitivities}
          />
        ) : null}

        <SettingsRowDivider />

        <SettingsRow
          icon="pulse-outline"
          label="Symptoms"
          value={summarizeHealthList(profile?.commonSymptoms)}
          expanded={expandedSection === 'symptoms'}
          onPress={() => toggleSection('symptoms')}
        />
        {expandedSection === 'symptoms' ? (
          <SettingsHealthListPicker
            options={symptomOptions}
            selectedValues={selectedSymptoms}
            customValueCount={customSymptoms.length}
            saveLabel="Save symptoms"
            isSaving={busySection === 'symptoms'}
            disabled={busySection !== null}
            onValuesChange={setSelectedSymptoms}
            onOpenCustom={() => openCustomModal('symptoms')}
            onSave={handleSaveSymptoms}
          />
        ) : null}

        <SettingsRowDivider />

        <SettingsRow
          icon="nutrition-outline"
          label="Diet goal"
          value={summarizeDietPreferences(profile?.dietPreferences)}
          expanded={expandedSection === 'diet'}
          onPress={() => toggleSection('diet')}
        />
        {expandedSection === 'diet' ? (
          <SettingsExpandedBlock>
            <Text style={styles.helperText}>
              We keep your gut-risk score separate, then check scans against this diet goal.
            </Text>
            <View style={styles.pickerStack}>
              <OnboardingPickerOption
                label="No specific diet"
                variant="plain"
                selected={selectedDietKeys.length === 0}
                onPress={() => setSelectedDietKeys([])}
              />
              {dietPreferenceOptions.map((option) => (
                <OnboardingPickerOption
                  key={option.key}
                  label={option.label}
                  variant="plain"
                  selected={selectedDietKeys.includes(option.key)}
                  onPress={() =>
                    setSelectedDietKeys((current) =>
                      current.includes(option.key)
                        ? current.filter((entry) => entry !== option.key)
                        : [...current, option.key],
                    )
                  }
                />
              ))}
            </View>
            <PrimaryButton
              label={busySection === 'diet' ? 'Saving…' : 'Save diet goal'}
              onPress={() => void handleSaveDiet()}
              disabled={busySection !== null}
            />
          </SettingsExpandedBlock>
        ) : null}
      </SettingsSectionGroup>

      {status?.placement === 'health' ? (
        <InfoPill label={status.message} tone={status.tone} />
      ) : null}

      <CustomEntryModal
        visible={customModalCategory !== null}
        title={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].title : ''}
        subtitle={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].subtitle : undefined}
        placeholder={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].placeholder : ''}
        value={customEntry}
        onChangeText={setCustomEntry}
        onSubmit={addCustomEntry}
        onClose={closeCustomModal}
        values={customModalCategory ? customValuesForModal(customModalCategory) : []}
        onRemove={(value) => {
          if (customModalCategory) removeCustomEntry(customModalCategory, value);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  helperText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  pickerStack: {
    gap: spacing.xs,
  },
});

import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  DetailScreenHeader,
  InfoPill,
  InputField,
  OnboardingPickerOption,
  OptionChip,
  PrimaryButton,
  SecondaryButton,
} from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { CustomEntryModal } from '../../components/modals/CustomEntryModal';
import { env } from '../../config/env';
import {
  conditionOptions,
  dietPreferenceLabelFromKey,
  dietPreferenceOptions,
  ingredientSensitivityOptions,
  symptomOptions,
} from '../../data/catalog';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList, SettingsSection } from '../../navigation/types';
import { apiClient } from '../../services/api/client';
import { signOut } from '../../services/auth';
import { trackEvent } from '../../services/analytics';
import {
  ensureDailyCheckinScheduled,
  getDailyCheckinTimePreference,
  getDailyReportNotificationStatus,
  registerDailyReportNotifications,
  setDailyCheckinTimePreference,
  getNotificationPermissionState,
} from '../../services/notifications';
import { useAppStore } from '../../store/useAppStore';
import { radii, spacing, tokens, type } from '../../theme';
import { describeProfileForPip } from './profileSummary';
import { openDeleteConfirmation, openIfPresent, openLegalSurface } from './settingsActions';
import {
  accountMetaLine,
  prettyStatus,
  splitByCatalog,
  summarizeDietPreferences,
  summarizeHealthList,
} from './settingsFormatting';
import {
  CHECKIN_TIME_PRESETS,
  CUSTOM_CATEGORY_COPY,
  type CustomCategory,
} from './settingsOptions';
import { SettingsExpandedBlock } from './SettingsExpandedBlock';
import { SettingsHealthListPicker } from './SettingsHealthListPicker';
import { SettingsMetricRow } from './SettingsMetricRow';
import { SettingsRow } from './SettingsRow';
import { SettingsRowDivider } from './SettingsRowDivider';
import { SettingsSectionGroup } from './SettingsSectionGroup';

type ExpandedSection = SettingsSection | null;
const HEALTH_PROFILE_SECTIONS: SettingsSection[] = [
  'conditions',
  'sensitivities',
  'symptoms',
  'diet',
];
type BusySection =
  | 'account'
  | 'conditions'
  | 'sensitivities'
  | 'symptoms'
  | 'diet'
  | 'notifications'
  | 'delete'
  | null;
// Save confirmations render adjacent to the section they belong to — never
// below the danger zone at the bottom of the screen.
type StatusPlacement = 'account' | 'health' | 'general';
type StatusFeedback = {
  placement: StatusPlacement;
  message: string;
  tone: 'soft' | 'warm';
};

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Settings'>>();
  const scrollRef = useRef<ScrollView>(null);
  const healthProfileOffset = useRef(0);
  const authUser = useAppStore((state) => state.authUser);
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackBilling = useAppStore((state) => state.billing);
  const updateProfileSettings = useAppStore((state) => state.updateProfileSettings);
  const insightsQuery = useInsightsData('');
  const profile = insightsQuery.data?.profile ?? fallbackProfile;
  const billing = insightsQuery.data?.billing ?? fallbackBilling;

  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState(profile?.displayName ?? '');
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
  const [busySection, setBusySection] = useState<BusySection>(null);
  const [status, setStatus] = useState<StatusFeedback | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const [checkinHour, setCheckinHour] = useState<number | null>(null);
  const [customModalCategory, setCustomModalCategory] = useState<CustomCategory | null>(null);
  const [customEntry, setCustomEntry] = useState('');

  useEffect(() => {
    setDisplayNameDraft(profile?.displayName ?? '');
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
    profile?.displayName,
    profile?.knownConditions,
    profile?.knownIngredientSensitivities,
  ]);

  useEffect(() => {
    void getDailyReportNotificationStatus()
      .then(setNotificationsEnabled)
      .catch(() => {
        setNotificationsEnabled(false);
      });
    void getNotificationPermissionState()
      .then((permission) => setNotificationsBlocked(!permission.granted && !permission.canAskAgain))
      .catch(() => {
        setNotificationsBlocked(false);
      });
    void getDailyCheckinTimePreference()
      .then((preference) => setCheckinHour(preference.hour))
      .catch(() => {
        setCheckinHour(null);
      });
  }, []);

  useEffect(() => {
    const section = route.params?.section;
    if (!section) {
      return;
    }
    setExpandedSection(section);
    if (!HEALTH_PROFILE_SECTIONS.includes(section)) {
      return;
    }
    // Wait for the section to expand and lay out before scrolling it into view.
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, healthProfileOffset.current - spacing.lg),
        animated: true,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [route.params?.section]);

  function toggleSection(next: Exclude<ExpandedSection, null>) {
    setExpandedSection((current) => (current === next ? null : next));
  }

  // Shared flow for the predefined+custom health-profile lists (conditions,
  // sensitivities, symptoms). Each only differs by section key, profile field,
  // merged values, analytics count key, and the noun used in status messages.
  async function saveHealthProfileSection(
    section: NonNullable<BusySection>,
    noun: string,
    update: Parameters<typeof updateProfileSettings>[0],
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
    return saveHealthProfileSection('conditions', 'Conditions', { knownConditions: merged }, 'conditions_count', merged.length);
  }

  function handleSaveSensitivities() {
    const merged = [...selectedSensitivities, ...customSensitivities];
    return saveHealthProfileSection('sensitivities', 'Sensitivities', { knownIngredientSensitivities: merged }, 'sensitivities_count', merged.length);
  }

  function handleSaveSymptoms() {
    const merged = [...selectedSymptoms, ...customSymptoms];
    return saveHealthProfileSection('symptoms', 'Symptoms', { commonSymptoms: merged }, 'symptoms_count', merged.length);
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
      if (!exists) setCustomConditions((prev) => [...prev, trimmed]);
    } else if (customModalCategory === 'sensitivities') {
      const exists = customSensitivities.some((value) => value.toLowerCase() === normalized);
      if (!exists) setCustomSensitivities((prev) => [...prev, trimmed]);
    } else if (customModalCategory === 'symptoms') {
      const exists = customSymptoms.some((value) => value.toLowerCase() === normalized);
      if (!exists) setCustomSymptoms((prev) => [...prev, trimmed]);
    }

    setCustomEntry('');
  }

  function removeCustomEntry(category: CustomCategory, value: string) {
    if (category === 'conditions') {
      setCustomConditions((prev) => prev.filter((entry) => entry !== value));
    } else if (category === 'sensitivities') {
      setCustomSensitivities((prev) => prev.filter((entry) => entry !== value));
    } else {
      setCustomSymptoms((prev) => prev.filter((entry) => entry !== value));
    }
  }

  function getCustomValuesForModal(category: CustomCategory) {
    if (category === 'conditions') return customConditions;
    if (category === 'sensitivities') return customSensitivities;
    return customSymptoms;
  }

  async function handleSaveAccount() {
    setBusySection('account');
    setStatus(null);
    try {
      await updateProfileSettings({ displayName: displayNameDraft.trim() || null });
      setStatus({ placement: 'account', message: 'Display name saved.', tone: 'soft' });
      setExpandedSection(null);
    } catch (error) {
      setStatus({
        placement: 'account',
        message: error instanceof Error ? error.message : 'Display name could not be saved.',
        tone: 'warm',
      });
    } finally {
      setBusySection(null);
    }
  }

  async function handleCheckinTimeChange(hour: number) {
    setCheckinHour(hour);
    try {
      await setDailyCheckinTimePreference(hour, 0);
      const state = useAppStore.getState();
      await ensureDailyCheckinScheduled({ reports: state.dailyReports, scans: state.scans });
      trackEvent('daily_checkin_time_changed', { hour });
    } catch (error) {
      setStatus({
        placement: 'account',
        message: error instanceof Error ? error.message : 'Reminder time could not be saved.',
        tone: 'warm',
      });
    }
  }

  async function handleEnableNotifications() {
    setBusySection('notifications');
    setStatus(null);
    try {
      // Permanently denied: the iOS dialog can never reappear, so the only
      // working path is the system Settings page for this app.
      const permission = await getNotificationPermissionState();
      if (!permission.granted && !permission.canAskAgain) {
        setNotificationsBlocked(true);
        setStatus({
          placement: 'account',
          message: 'Notifications are turned off in iOS Settings — flip them on there and come back.',
          tone: 'warm',
        });
        await Linking.openSettings();
        return;
      }

      await registerDailyReportNotifications();
      setNotificationsEnabled(true);
      setNotificationsBlocked(false);
      setStatus({
        placement: 'account',
        message: 'Daily report reminders are enabled.',
        tone: 'soft',
      });
    } catch (error) {
      setNotificationsEnabled(false);
      setStatus({
        placement: 'account',
        message: error instanceof Error ? error.message : 'Notifications could not be enabled.',
        tone: 'warm',
      });
    } finally {
      setBusySection(null);
    }
  }

  function resetToCreateAccount() {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'OnboardingStack',
          params: { screen: 'OnboardingAuth' },
        },
      ],
    });
  }

  function resetToSignIn() {
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'OnboardingStack',
          params: { screen: 'OnboardingSignIn' },
        },
      ],
    });
  }

  async function handleSignOut() {
    setStatus(null);
    try {
      await signOut();
      resetToSignIn();
    } catch (error) {
      setStatus({
        placement: 'general',
        message: error instanceof Error ? error.message : 'Sign out could not be completed.',
        tone: 'warm',
      });
    }
  }

  async function handleDeleteAccount() {
    setBusySection('delete');
    setStatus(null);
    try {
      await apiClient.deleteAccount();
      await signOut();
      resetToCreateAccount();
    } catch (error) {
      setStatus({
        placement: 'general',
        message:
          error instanceof Error ? error.message : 'Account deletion could not be completed.',
        tone: 'warm',
      });
    } finally {
      setBusySection(null);
    }
  }

  const subscriptionBadge =
    billing.subscriptionStatus === 'none' ? undefined : prettyStatus(billing.subscriptionStatus);
  const notificationBadge = notificationsEnabled ? 'On' : 'Off';

  const profileSummary = describeProfileForPip({
    conditions: profile?.knownConditions ?? [],
    sensitivities: profile?.knownIngredientSensitivities ?? [],
    dietLabels: (profile?.dietPreferences ?? []).map((preference) => preference.label),
  });

  return (
    <AppScreen scrollViewRef={scrollRef}>
      <DetailScreenHeader eyebrow="Your account" title="Settings" />

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <Pip state="subtle" size={56} />
          <View style={styles.profileHeaderCopy}>
            <Text style={styles.profileEyebrow}>What Pip knows about you</Text>
            <Text style={styles.profileMeta} numberOfLines={1}>
              {accountMetaLine(profile?.displayName, authUser?.email)}
            </Text>
          </View>
        </View>
        <Text style={styles.profileSummary}>{profileSummary}</Text>
      </View>

      <SettingsSectionGroup label="Account">
        <SettingsRow
          icon="person-outline"
          label="Display name"
          value={profile?.displayName?.trim() ? profile.displayName : 'Not set'}
          expanded={expandedSection === 'account'}
          onPress={() => toggleSection('account')}
        />
        {expandedSection === 'account' ? (
          <SettingsExpandedBlock>
            <InputField
              value={displayNameDraft}
              placeholder="Enter a display name"
              onChangeText={setDisplayNameDraft}
            />
            <Text style={styles.helperText}>
              Optional. Leave blank if you do not want a name shown in the app.
            </Text>
            <PrimaryButton
              label={busySection === 'account' ? 'Saving…' : 'Save'}
              onPress={() => void handleSaveAccount()}
              disabled={busySection !== null}
            />
          </SettingsExpandedBlock>
        ) : null}

        <SettingsRowDivider />

        <SettingsRow
          icon="diamond-outline"
          label="Subscription"
          badge={subscriptionBadge}
          expanded={expandedSection === 'subscription'}
          onPress={() => toggleSection('subscription')}
        />
        {expandedSection === 'subscription' ? (
          <SettingsExpandedBlock>
            <SettingsMetricRow label="Status" value={prettyStatus(billing.subscriptionStatus)} />
            <SettingsMetricRow label="Plan" value={billing.selectedPlan} />
            <SettingsMetricRow
              label="Trial ends"
              value={
                billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : '—'
              }
            />
          </SettingsExpandedBlock>
        ) : null}

        <SettingsRowDivider />

        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          badge={notificationBadge}
          expanded={expandedSection === 'notifications'}
          onPress={() => toggleSection('notifications')}
        />
        {expandedSection === 'notifications' ? (
          <SettingsExpandedBlock>
            <Text style={styles.helperText}>
              One evening check-in reminder a day, plus a weekly gut report. Answer the reminder
              with a single tap.
            </Text>
            <View style={styles.pickerStack}>
              {CHECKIN_TIME_PRESETS.map((preset) => (
                <OptionChip
                  key={preset.hour}
                  label={preset.label}
                  selected={checkinHour === preset.hour}
                  onPress={() => void handleCheckinTimeChange(preset.hour)}
                />
              ))}
            </View>
            <PrimaryButton
              label={
                busySection === 'notifications'
                  ? 'Enabling…'
                  : notificationsBlocked
                    ? 'Open iOS Settings'
                    : notificationsEnabled
                      ? 'Refresh access'
                      : 'Enable reminders'
              }
              onPress={() => void handleEnableNotifications()}
              disabled={busySection !== null}
            />
          </SettingsExpandedBlock>
        ) : null}
      </SettingsSectionGroup>

      {status?.placement === 'account' ? (
        <InfoPill label={status.message} tone={status.tone} />
      ) : null}

      <SettingsSectionGroup
        label="Health profile"
        onLayout={(event) => {
          healthProfileOffset.current = event.nativeEvent.layout.y;
        }}
      >
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

      <SettingsSectionGroup label="Support & legal">
        <SettingsRow
          icon="help-circle-outline"
          label="Help & support"
          onPress={() => void openIfPresent(`mailto:${env.supportEmail}`)}
        />
        <SettingsRowDivider />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy & security"
          onPress={() =>
            openLegalSurface(env.privacyUrl, () =>
              navigation.navigate('LegalDocument', { document: 'privacy' }),
            )
          }
        />
        <SettingsRowDivider />
        <SettingsRow
          icon="download-outline"
          label="Export my data"
          onPress={() =>
            void openIfPresent(
              `mailto:${env.supportEmail}?subject=MyTummyHurts%20data%20export%20request`,
            )
          }
        />
      </SettingsSectionGroup>

      <SettingsSectionGroup label="Danger zone">
        <SettingsRow
          icon="trash-outline"
          label="Delete my data"
          danger
          onPress={() => openDeleteConfirmation(() => void handleDeleteAccount())}
        />
      </SettingsSectionGroup>

      {status?.placement === 'general' ? (
        <InfoPill label={status.message} tone={status.tone} />
      ) : null}

      <SecondaryButton label="Sign out" onPress={() => void handleSignOut()} />

      <Text style={styles.versionLabel}>App version 1.2.0</Text>

      <CustomEntryModal
        visible={customModalCategory !== null}
        title={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].title : ''}
        subtitle={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].subtitle : undefined}
        placeholder={customModalCategory ? CUSTOM_CATEGORY_COPY[customModalCategory].placeholder : ''}
        value={customEntry}
        onChangeText={setCustomEntry}
        onSubmit={addCustomEntry}
        onClose={closeCustomModal}
        values={customModalCategory ? getCustomValuesForModal(customModalCategory) : []}
        onRemove={(value) => {
          if (customModalCategory) removeCustomEntry(customModalCategory, value);
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  // The screen's hero: what Pip knows about you, stated warmly in the
  // Bricolage accent face on the warm card surface. Borderless like every
  // Deep Garden card — separation comes from the green-cast lift. Everything
  // below it recedes into utility lists.
  profileCard: {
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.warm,
    padding: spacing.md,
    gap: spacing.sm,
    ...tokens.shadow.card,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  profileEyebrow: {
    ...tokens.type.label.eyebrow,
    color: tokens.color.text.tertiary,
    textTransform: 'uppercase',
  },
  profileMeta: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: tokens.color.text.secondary,
  },
  profileSummary: {
    ...tokens.type.display.accent,
    color: tokens.color.text.primary,
  },
  helperText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  pickerStack: {
    gap: spacing.xs,
  },
  versionLabel: {
    alignSelf: 'center',
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 12,
    marginTop: spacing.sm,
  },
});

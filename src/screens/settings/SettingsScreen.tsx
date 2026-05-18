import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { ComponentProps, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  AppScreen,
  DetailScreenHeader,
  InfoPill,
  InputField,
  OnboardingPickerOption,
  PrimaryButton,
  SecondaryButton,
} from '../../components/common/UI';
import { env } from '../../config/env';
import { conditionOptions, ingredientSensitivityOptions, symptomOptions } from '../../data/catalog';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList } from '../../navigation/types';
import { apiClient } from '../../services/api/client';
import { signOutSupabase } from '../../services/auth';
import { trackEvent } from '../../services/analytics';
import {
  getDailyReportNotificationStatus,
  registerDailyReportNotifications,
} from '../../services/notifications';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type ExpandedSection = 'account' | 'profile' | 'subscription' | 'notifications' | null;
type CustomCategory = 'conditions' | 'sensitivities' | 'symptoms';

const CUSTOM_CATEGORY_COPY: Record<
  CustomCategory,
  { title: string; subtitle: string; placeholder: string }
> = {
  conditions: {
    title: 'Add a custom condition',
    subtitle: 'Add anything we should consider when personalizing your scans.',
    placeholder: "Example: SIBO, gastritis, Crohn's",
  },
  sensitivities: {
    title: 'Add a custom sensitivity',
    subtitle: 'Add any food or ingredient you already suspect.',
    placeholder: 'Example: eggs, soy, coffee',
  },
  symptoms: {
    title: 'Add a custom symptom',
    subtitle: 'Add any symptom you want your daily reports to track.',
    placeholder: 'Example: cramping, burping, trapped gas',
  },
};

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
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
  const [busySection, setBusySection] = useState<
    'account' | 'profile' | 'notifications' | 'delete' | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
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
  }, [
    profile?.commonSymptoms,
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
  }, []);

  function toggleValue(
    currentValues: string[],
    setValues: (values: string[]) => void,
    value: string,
  ) {
    setValues(
      currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value],
    );
  }

  function toggleSection(next: Exclude<ExpandedSection, null>) {
    setExpandedSection((current) => (current === next ? null : next));
  }

  async function handleSaveProfile() {
    setBusySection('profile');
    setStatusMessage(null);
    const mergedConditions = [...selectedConditions, ...customConditions];
    const mergedSensitivities = [...selectedSensitivities, ...customSensitivities];
    const mergedSymptoms = [...selectedSymptoms, ...customSymptoms];
    try {
      await updateProfileSettings({
        knownConditions: mergedConditions,
        knownIngredientSensitivities: mergedSensitivities,
        commonSymptoms: mergedSymptoms,
        symptomFrequency: profile?.symptomFrequency,
        symptomSeverityBaseline: profile?.symptomSeverityBaseline,
        mealContexts: profile?.mealContexts ?? [],
        motivation: profile?.motivation,
      });
      trackEvent('profile_saved', {
        conditions_count: mergedConditions.length,
        sensitivities_count: mergedSensitivities.length,
      });
      setStatusMessage('Profile changes saved.');
      setExpandedSection(null);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Profile changes could not be saved.',
      );
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
    setStatusMessage(null);
    try {
      await updateProfileSettings({ displayName: displayNameDraft.trim() || null });
      setStatusMessage('Display name saved.');
      setExpandedSection(null);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Display name could not be saved.',
      );
    } finally {
      setBusySection(null);
    }
  }

  async function handleEnableNotifications() {
    setBusySection('notifications');
    setStatusMessage(null);
    try {
      await registerDailyReportNotifications();
      setNotificationsEnabled(true);
      setStatusMessage('Daily report reminders are enabled.');
    } catch (error) {
      setNotificationsEnabled(false);
      setStatusMessage(
        error instanceof Error ? error.message : 'Notifications could not be enabled.',
      );
    } finally {
      setBusySection(null);
    }
  }

  async function handleDeleteAccount() {
    setBusySection('delete');
    setStatusMessage(null);
    try {
      await apiClient.deleteAccount();
      await signOutSupabase();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Account deletion could not be completed.',
      );
    } finally {
      setBusySection(null);
    }
  }

  const subscriptionBadge =
    billing.subscriptionStatus === 'none' ? undefined : prettyStatus(billing.subscriptionStatus);
  const notificationBadge = notificationsEnabled ? 'On' : 'Off';

  return (
    <AppScreen>
      <DetailScreenHeader eyebrow="Settings" />

      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarLabel}>
            {accountInitials(profile?.displayName, authUser?.email)}
          </Text>
        </View>
        <View style={styles.profileCopy}>
          <Text style={styles.profileName}>{accountTitle(profile?.displayName)}</Text>
          <Text style={styles.profileEmail}>{authUser?.email ?? 'No active session'}</Text>
        </View>
      </View>

      <SectionGroup label="Account">
        <SettingsRow
          icon="person-outline"
          label="Display name"
          value={profile?.displayName?.trim() ? profile.displayName : 'Not set'}
          expanded={expandedSection === 'account'}
          onPress={() => toggleSection('account')}
        />
        {expandedSection === 'account' ? (
          <ExpandedBlock>
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
          </ExpandedBlock>
        ) : null}

        <RowDivider />

        <SettingsRow
          icon="diamond-outline"
          label="Subscription"
          badge={subscriptionBadge}
          expanded={expandedSection === 'subscription'}
          onPress={() => toggleSection('subscription')}
        />
        {expandedSection === 'subscription' ? (
          <ExpandedBlock>
            <MetricRow label="Status" value={prettyStatus(billing.subscriptionStatus)} />
            <MetricRow label="Plan" value={billing.selectedPlan} />
            <MetricRow label="Tokens remaining" value={`${billing.tokensRemaining}`} />
            <MetricRow
              label="Trial ends"
              value={
                billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : '—'
              }
            />
          </ExpandedBlock>
        ) : null}

        <RowDivider />

        <SettingsRow
          icon="notifications-outline"
          label="Notifications"
          badge={notificationBadge}
          expanded={expandedSection === 'notifications'}
          onPress={() => toggleSection('notifications')}
        />
        {expandedSection === 'notifications' ? (
          <ExpandedBlock>
            <Text style={styles.helperText}>
              We only use notifications to remind you to log a daily gut report.
            </Text>
            <PrimaryButton
              label={
                busySection === 'notifications'
                  ? 'Enabling…'
                  : notificationsEnabled
                    ? 'Refresh access'
                    : 'Enable reminders'
              }
              onPress={() => void handleEnableNotifications()}
              disabled={busySection !== null}
            />
          </ExpandedBlock>
        ) : null}
      </SectionGroup>

      <SectionGroup label="Health profile">
        <SettingsRow
          icon="medkit-outline"
          label="Conditions & sensitivities"
          value={summarizeProfile(profile)}
          expanded={expandedSection === 'profile'}
          onPress={() => toggleSection('profile')}
        />
        {expandedSection === 'profile' ? (
          <ExpandedBlock>
            <FieldLabel>Conditions</FieldLabel>
            <View style={styles.pickerStack}>
              {conditionOptions.map((option) => (
                <OnboardingPickerOption
                  key={option}
                  label={option}
                  variant="plain"
                  selected={selectedConditions.includes(option)}
                  onPress={() => toggleValue(selectedConditions, setSelectedConditions, option)}
                />
              ))}
              <OnboardingPickerOption
                label="Other"
                variant="plain"
                selected={false}
                badgeText={customConditions.length > 0 ? `+${customConditions.length}` : undefined}
                onPress={() => openCustomModal('conditions')}
              />
            </View>

            <FieldLabel>Sensitivities</FieldLabel>
            <View style={styles.pickerStack}>
              {ingredientSensitivityOptions.map((option) => (
                <OnboardingPickerOption
                  key={option}
                  label={option}
                  variant="plain"
                  selected={selectedSensitivities.includes(option)}
                  onPress={() =>
                    toggleValue(selectedSensitivities, setSelectedSensitivities, option)
                  }
                />
              ))}
              <OnboardingPickerOption
                label="Other"
                variant="plain"
                selected={false}
                badgeText={
                  customSensitivities.length > 0 ? `+${customSensitivities.length}` : undefined
                }
                onPress={() => openCustomModal('sensitivities')}
              />
            </View>

            <FieldLabel>Common symptoms</FieldLabel>
            <View style={styles.pickerStack}>
              {symptomOptions.map((option) => (
                <OnboardingPickerOption
                  key={option}
                  label={option}
                  variant="plain"
                  selected={selectedSymptoms.includes(option)}
                  onPress={() => toggleValue(selectedSymptoms, setSelectedSymptoms, option)}
                />
              ))}
              <OnboardingPickerOption
                label="Other"
                variant="plain"
                selected={false}
                badgeText={customSymptoms.length > 0 ? `+${customSymptoms.length}` : undefined}
                onPress={() => openCustomModal('symptoms')}
              />
            </View>

            <PrimaryButton
              label={busySection === 'profile' ? 'Saving…' : 'Save'}
              onPress={() => void handleSaveProfile()}
              disabled={busySection !== null}
            />
          </ExpandedBlock>
        ) : null}
      </SectionGroup>

      <SectionGroup label="Support & legal">
        <SettingsRow
          icon="help-circle-outline"
          label="Help & support"
          onPress={() => void openIfPresent(`mailto:${env.supportEmail}`)}
        />
        <RowDivider />
        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy & security"
          onPress={() =>
            openLegalSurface(env.privacyUrl, () =>
              navigation.navigate('LegalDocument', { document: 'privacy' }),
            )
          }
        />
        <RowDivider />
        <SettingsRow
          icon="download-outline"
          label="Export my data"
          onPress={() =>
            void openIfPresent(
              `mailto:${env.supportEmail}?subject=MyTummyHurts%20data%20export%20request`,
            )
          }
        />
        {__DEV__ ? (
          <>
            <RowDivider />
            <SettingsRow
              icon="color-palette-outline"
              label="Design system showcase"
              onPress={() => navigation.navigate('DesignSystemShowcase')}
            />
          </>
        ) : null}
      </SectionGroup>

      <SectionGroup label="Danger zone">
        <SettingsRow
          icon="trash-outline"
          label="Delete my data"
          danger
          onPress={() => openDeleteConfirmation(() => void handleDeleteAccount())}
        />
      </SectionGroup>

      {statusMessage ? <InfoPill label={statusMessage} tone="soft" /> : null}

      <SecondaryButton label="Sign out" onPress={() => void signOutSupabase()} />

      <Text style={styles.versionLabel}>App version 1.2.0</Text>

      <Modal
        animationType="fade"
        transparent
        visible={customModalCategory !== null}
        onRequestClose={closeCustomModal}
      >
        <View style={styles.customModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close custom entry"
            style={styles.customModalBackdrop}
            onPress={closeCustomModal}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={styles.customModalKeyboard}
          >
            {customModalCategory ? (
              <View style={styles.customModalCard}>
                <View style={styles.customModalHeader}>
                  <View style={styles.customModalTitleWrap}>
                    <Text style={styles.customModalTitle}>
                      {CUSTOM_CATEGORY_COPY[customModalCategory].title}
                    </Text>
                    <Text style={styles.customModalSubtitle}>
                      {CUSTOM_CATEGORY_COPY[customModalCategory].subtitle}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={closeCustomModal}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.customModalClose,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Ionicons name="close" size={20} color={tokens.color.icon.primary} />
                  </Pressable>
                </View>
                <InputField
                  value={customEntry}
                  placeholder={CUSTOM_CATEGORY_COPY[customModalCategory].placeholder}
                  onChangeText={setCustomEntry}
                  autoFocus
                />
                <PrimaryButton
                  label="Add"
                  onPress={addCustomEntry}
                  disabled={!customEntry.trim()}
                />
                {getCustomValuesForModal(customModalCategory).length > 0 ? (
                  <View style={styles.customValuesStack}>
                    {getCustomValuesForModal(customModalCategory).map((value) => (
                      <View key={value} style={styles.customValuePill}>
                        <Text style={styles.customValueText}>{value}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${value}`}
                          onPress={() => removeCustomEntry(customModalCategory, value)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.customValueRemove,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Ionicons
                            name="close"
                            size={13}
                            color={tokens.color.text.inverse}
                          />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </AppScreen>
  );
}

function SectionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.groupBlock}>
      <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
      <View style={styles.groupCard}>{children}</View>
    </View>
  );
}

function ExpandedBlock({ children }: { children: React.ReactNode }) {
  return <View style={styles.expandedBlock}>{children}</View>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function SettingsRow({
  icon,
  label,
  value,
  badge,
  onPress,
  expanded,
  danger,
}: {
  icon: IoniconName;
  label: string;
  value?: string;
  badge?: string;
  onPress: () => void;
  expanded?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.78 }]}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? tokens.color.status.danger.foreground : palette.primary}
        />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && { color: tokens.color.status.danger.foreground }]}>
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function RowDivider() {
  return <View style={styles.divider} />;
}

function splitByCatalog(values: string[], catalog: readonly string[]) {
  const catalogLower = new Set(catalog.map((entry) => entry.toLowerCase()));
  const predefined: string[] = [];
  const custom: string[] = [];
  for (const value of values) {
    if (catalogLower.has(value.toLowerCase())) {
      predefined.push(value);
    } else {
      custom.push(value);
    }
  }
  return { predefined, custom };
}

function accountInitials(displayName?: string | null, email?: string | null) {
  const trimmedDisplayName = displayName?.trim();
  if (trimmedDisplayName) {
    const parts = trimmedDisplayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
    }
    return trimmedDisplayName.slice(0, 2).toUpperCase();
  }

  const emailPrefix = email?.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix.slice(0, 2).toUpperCase();
  }

  return 'U';
}

function accountTitle(displayName?: string | null) {
  const trimmedDisplayName = displayName?.trim();
  return trimmedDisplayName ?? '';
}

function prettyStatus(status: string) {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function summarizeProfile(profile: { knownConditions?: string[]; knownIngredientSensitivities?: string[]; commonSymptoms?: string[] } | null | undefined) {
  if (!profile) return 'Tap to configure';
  const total =
    (profile.knownConditions?.length ?? 0) +
    (profile.knownIngredientSensitivities?.length ?? 0) +
    (profile.commonSymptoms?.length ?? 0);
  if (total === 0) return 'Tap to configure';
  return `${total} item${total === 1 ? '' : 's'} configured`;
}

async function openIfPresent(url: string) {
  await Linking.openURL(url);
}

function openLegalSurface(url: string, fallback: () => void) {
  if (!url || url.includes('example.com')) {
    fallback();
    return;
  }

  void openIfPresent(url).catch(() => {
    fallback();
  });
}

function openDeleteConfirmation(onConfirm: () => void) {
  Alert.alert(
    'Delete account?',
    'This permanently removes your scans, history, insights, and saved profile data.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    padding: spacing.md,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: components.avatar.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLabel: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 20,
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  profileEmail: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 17,
  },
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
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.color.border.subtle,
    marginLeft: spacing.md + 34 + spacing.sm,
  },
  expandedBlock: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border.subtle,
  },
  helperText: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 14,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  pickerStack: {
    gap: spacing.xs,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 4,
  },
  metricLabel: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  metricValue: {
    color: tokens.color.text.primary,
    fontFamily: type.body.semibold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  versionLabel: {
    alignSelf: 'center',
    color: tokens.color.text.tertiary,
    fontFamily: type.body.medium,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  customModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(22, 29, 33, 0.44)',
  },
  customModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  customModalKeyboard: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 1,
  },
  customModalCard: {
    width: '100%',
    maxWidth: 380,
    zIndex: 2,
    borderRadius: 24,
    backgroundColor: tokens.color.surface.sheet,
    padding: spacing.lg,
    gap: spacing.md,
    ...tokens.shadow.modal,
  },
  customModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  customModalTitleWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  customModalTitle: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 20,
    lineHeight: 25,
  },
  customModalSubtitle: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  customModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tokens.color.surface.card.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customValuesStack: {
    gap: spacing.sm,
  },
  customValuePill: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    paddingRight: 42,
    justifyContent: 'center',
    position: 'relative',
  },
  customValueText: {
    color: tokens.color.text.inverse,
    fontFamily: type.body.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  customValueRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

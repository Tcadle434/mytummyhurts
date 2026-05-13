import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  InfoPill,
  InputField,
  OptionChip,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SectionCard,
} from '../../components/common/UI';
import { env } from '../../config/env';
import { conditionOptions, ingredientSensitivityOptions, symptomOptions } from '../../data/catalog';
import { useInsightsData } from '../../features/insights/hooks';
import { RootStackParamList } from '../../navigation/types';
import { apiClient } from '../../services/api/client';
import { signOutSupabase } from '../../services/auth';
import { trackEvent } from '../../services/analytics';
import { getDailyReportNotificationStatus, registerDailyReportNotifications } from '../../services/notifications';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type ExpandedSection = 'account' | 'profile' | 'subscription' | 'notifications' | null;

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
  const [selectedConditions, setSelectedConditions] = useState<string[]>(profile?.knownConditions ?? []);
  const [selectedSensitivities, setSelectedSensitivities] = useState<string[]>(profile?.knownIngredientSensitivities ?? []);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(profile?.commonSymptoms ?? []);
  const [busySection, setBusySection] = useState<'account' | 'profile' | 'notifications' | 'delete' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    setDisplayNameDraft(profile?.displayName ?? '');
    setSelectedConditions(profile?.knownConditions ?? []);
    setSelectedSensitivities(profile?.knownIngredientSensitivities ?? []);
    setSelectedSymptoms(profile?.commonSymptoms ?? []);
  }, [profile?.commonSymptoms, profile?.displayName, profile?.knownConditions, profile?.knownIngredientSensitivities]);

  useEffect(() => {
    void getDailyReportNotificationStatus()
      .then(setNotificationsEnabled)
      .catch(() => {
        setNotificationsEnabled(false);
      });
  }, []);

  function toggleValue(currentValues: string[], setValues: (values: string[]) => void, value: string) {
    setValues(currentValues.includes(value) ? currentValues.filter((entry) => entry !== value) : [...currentValues, value]);
  }

  async function handleSaveProfile() {
    setBusySection('profile');
    setStatusMessage(null);
    try {
      await updateProfileSettings({
        knownConditions: selectedConditions,
        knownIngredientSensitivities: selectedSensitivities,
        commonSymptoms: selectedSymptoms,
        symptomFrequency: profile?.symptomFrequency,
        symptomSeverityBaseline: profile?.symptomSeverityBaseline,
        mealContexts: profile?.mealContexts ?? [],
        motivation: profile?.motivation,
      });
      trackEvent('profile_saved', {
        conditions_count: selectedConditions.length,
        sensitivities_count: selectedSensitivities.length,
      });
      setStatusMessage('Profile changes saved.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Profile changes could not be saved.');
    } finally {
      setBusySection(null);
    }
  }

  async function handleSaveAccount() {
    setBusySection('account');
    setStatusMessage(null);
    try {
      await updateProfileSettings({
        displayName: displayNameDraft.trim() || null,
      });
      setStatusMessage('Display name saved.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Display name could not be saved.');
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
      setStatusMessage(error instanceof Error ? error.message : 'Notifications could not be enabled.');
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
      setStatusMessage(error instanceof Error ? error.message : 'Account deletion could not be completed.');
    } finally {
      setBusySection(null);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Settings" />

      <View style={styles.profileCardBlock}>
        <Pressable
          onPress={() => toggleExpanded(expandedSection, setExpandedSection, 'account')}
          style={({ pressed }) => [pressed && { opacity: 0.9 }]}
        >
          <SectionCard style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarLabel}>{accountInitials(profile?.displayName, authUser?.email)}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{accountTitle(profile?.displayName)}</Text>
              <Text style={styles.profileEmail}>{authUser?.email ?? 'No active session'}</Text>
            </View>
            <Ionicons
              name={expandedSection === 'account' ? 'chevron-up' : 'chevron-forward'}
              size={20}
              color={palette.textMuted}
            />
          </SectionCard>
        </Pressable>

        {expandedSection === 'account' ? (
          <SectionCard style={styles.accountEditorCard}>
            <Text style={styles.expandedLabel}>Display name</Text>
            <InputField
              value={displayNameDraft}
              placeholder="Enter a display name"
              onChangeText={setDisplayNameDraft}
            />
            <Text style={styles.accountHelper}>Optional. Leave blank if you do not want a name shown in the app.</Text>
            <PrimaryButton
              label={busySection === 'account' ? 'Saving…' : 'Save display name'}
              onPress={() => void handleSaveAccount()}
              disabled={busySection !== null}
            />
          </SectionCard>
        ) : null}
      </View>

      <View style={styles.groupBlock}>
        <Text style={styles.groupLabel}>Your account</Text>
        <SectionCard style={styles.groupCard}>
          <SettingsRow
            icon="medkit-outline"
            label="Stomach profile & conditions"
            onPress={() => toggleExpanded(expandedSection, setExpandedSection, 'profile')}
            expanded={expandedSection === 'profile'}
          />
          {expandedSection === 'profile' ? (
            <View style={styles.expandedContent}>
              <Text style={styles.expandedLabel}>Conditions</Text>
              <View style={styles.optionWrap}>
                {conditionOptions.map((option) => (
                  <OptionChip key={option} label={option} selected={selectedConditions.includes(option)} onPress={() => toggleValue(selectedConditions, setSelectedConditions, option)} />
                ))}
              </View>

              <Text style={styles.expandedLabel}>Sensitivities</Text>
              <View style={styles.optionWrap}>
                {ingredientSensitivityOptions.map((option) => (
                  <OptionChip key={option} label={option} selected={selectedSensitivities.includes(option)} onPress={() => toggleValue(selectedSensitivities, setSelectedSensitivities, option)} />
                ))}
              </View>

              <Text style={styles.expandedLabel}>Common symptoms</Text>
              <View style={styles.optionWrap}>
                {symptomOptions.map((option) => (
                  <OptionChip key={option} label={option} selected={selectedSymptoms.includes(option)} onPress={() => toggleValue(selectedSymptoms, setSelectedSymptoms, option)} />
                ))}
              </View>

              <PrimaryButton label={busySection === 'profile' ? 'Saving…' : 'Save stomach profile'} onPress={() => void handleSaveProfile()} disabled={busySection !== null} />
            </View>
          ) : null}

          <Divider />

          <SettingsRow
            icon="diamond-outline"
            label="Subscription"
            badge={billing.subscriptionStatus === 'none' ? undefined : 'Premium'}
            onPress={() => toggleExpanded(expandedSection, setExpandedSection, 'subscription')}
            expanded={expandedSection === 'subscription'}
          />
          {expandedSection === 'subscription' ? (
            <View style={styles.expandedContent}>
              <MetricRow label="Status" value={billing.subscriptionStatus} />
              <MetricRow label="Plan" value={billing.selectedPlan} />
              <MetricRow label="Tokens remaining" value={`${billing.tokensRemaining}`} />
              <MetricRow label="Trial ends" value={billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : '—'} />
            </View>
          ) : null}

          <Divider />

          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => toggleExpanded(expandedSection, setExpandedSection, 'notifications')}
            expanded={expandedSection === 'notifications'}
          />
          {expandedSection === 'notifications' ? (
            <View style={styles.expandedContent}>
              <MetricRow label="Purpose" value="Daily gut reports" />
              <MetricRow label="Status" value={notificationsEnabled ? 'Enabled' : 'Not enabled'} />
              <PrimaryButton
                label={busySection === 'notifications' ? 'Enabling…' : notificationsEnabled ? 'Refresh access' : 'Enable reminders'}
                onPress={() => void handleEnableNotifications()}
                disabled={busySection !== null}
              />
            </View>
          ) : null}

          <Divider />

          <SettingsRow
            icon="time-outline"
            label="Reminders"
            subtitle="Daily gut report reminders"
            onPress={() => setExpandedSection('notifications')}
          />
        </SectionCard>
      </View>

      <View style={styles.groupBlock}>
        <Text style={styles.groupLabel}>Support & data</Text>
        <SectionCard style={styles.groupCard}>
          <SettingsRow icon="help-circle-outline" label="Help & support" onPress={() => openIfPresent(`mailto:${env.supportEmail}`)} />
          <Divider />
          {__DEV__ ? (
            <>
              <SettingsRow icon="color-palette-outline" label="Design system showcase" onPress={() => navigation.navigate('DesignSystemShowcase')} />
              <Divider />
            </>
          ) : null}
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy & security"
            onPress={() => openLegalSurface(env.privacyUrl, () => navigation.navigate('LegalDocument', { document: 'privacy' }))}
          />
          <Divider />
          <SettingsRow icon="download-outline" label="Export my data" onPress={() => openIfPresent(`mailto:${env.supportEmail}?subject=MyTummyHurts%20data%20export%20request`)} />
          <Divider />
          <SettingsRow
            icon="trash-outline"
            label="Delete my data"
            danger
            onPress={() => openDeleteConfirmation(() => void handleDeleteAccount())}
          />
        </SectionCard>
      </View>

      <SecondaryButton label="Sign out" onPress={() => void signOutSupabase()} />

      {statusMessage ? <InfoPill label={statusMessage} tone="soft" /> : null}

      <View style={styles.versionPill}>
        <Text style={styles.versionLabel}>App version 1.2.0</Text>
      </View>
    </AppScreen>
  );
}

function SettingsRow({
  icon,
  label,
  subtitle,
  badge,
  onPress,
  expanded,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
  expanded?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.78 }]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={danger ? palette.danger : palette.text} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, danger && { color: palette.danger }]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.rowBadge}>
          <Text style={styles.rowBadgeLabel}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={palette.textMuted} />
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

function Divider() {
  return <View style={styles.divider} />;
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
  if (trimmedDisplayName) {
    return trimmedDisplayName;
  }

  return 'Add display name';
}

function toggleExpanded(current: ExpandedSection, setExpanded: (value: ExpandedSection) => void, next: Exclude<ExpandedSection, null>) {
  setExpanded(current === next ? null : next);
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
  Alert.alert('Delete account?', 'This permanently removes your scans, history, insights, and saved profile data.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  profileCardBlock: {
    gap: spacing.md,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accountEditorCard: {
    gap: spacing.md,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: components.avatar.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLabel: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 22,
  },
  profileCopy: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  profileEmail: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  groupBlock: {
    gap: spacing.sm,
  },
  groupLabel: {
    color: palette.textMuted,
    fontFamily: type.body.bold,
    fontSize: 15,
  },
  groupCard: {
    gap: 0,
    paddingVertical: 0,
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 17,
  },
  rowSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 13,
  },
  rowBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: components.premiumBadge.background,
  },
  rowBadgeLabel: {
    color: components.premiumBadge.foreground,
    fontFamily: type.body.semibold,
    fontSize: 12,
  },
  expandedContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  expandedLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 16,
  },
  accountHelper: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  metricValue: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  divider: {
    height: 1,
    backgroundColor: palette.line,
    marginHorizontal: spacing.lg,
  },
  versionPill: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.surface.frosted,
  },
  versionLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
});

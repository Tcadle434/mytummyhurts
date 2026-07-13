import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  DetailScreenHeader,
  InfoPill,
  InputField,
  OptionChip,
  PrimaryButton,
  SecondaryButton,
} from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { env } from '../../config/env';
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
import { accountMetaLine, prettyStatus } from './settingsFormatting';
import { CHECKIN_TIME_PRESETS } from './settingsOptions';
import { SettingsExpandedBlock } from './SettingsExpandedBlock';
import { SettingsHealthProfileSection } from './SettingsHealthProfileSection';
import { SettingsMetricRow } from './SettingsMetricRow';
import { SettingsRow } from './SettingsRow';
import { SettingsRowDivider } from './SettingsRowDivider';
import { SettingsSectionGroup } from './SettingsSectionGroup';
import type {
  BusySettingsSection,
  ExpandedSettingsSection,
  SettingsStatusFeedback,
} from './settingsTypes';

const HEALTH_PROFILE_SECTIONS: SettingsSection[] = [
  'conditions',
  'sensitivities',
  'symptoms',
  'diet',
];

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

  const [expandedSection, setExpandedSection] = useState<ExpandedSettingsSection>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState(profile?.displayName ?? '');
  const [busySection, setBusySection] = useState<BusySettingsSection>(null);
  const [status, setStatus] = useState<SettingsStatusFeedback | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBlocked, setNotificationsBlocked] = useState(false);
  const [checkinHour, setCheckinHour] = useState<number | null>(null);

  useEffect(() => {
    setDisplayNameDraft(profile?.displayName ?? '');
  }, [profile?.displayName]);

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

  function toggleSection(next: Exclude<ExpandedSettingsSection, null>) {
    setExpandedSection((current) => (current === next ? null : next));
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

      <SettingsHealthProfileSection
        profile={profile}
        expandedSection={expandedSection}
        busySection={busySection}
        status={status}
        updateProfileSettings={updateProfileSettings}
        setExpandedSection={setExpandedSection}
        setBusySection={setBusySection}
        setStatus={setStatus}
        onLayout={(event) => {
          healthProfileOffset.current = event.nativeEvent.layout.y;
        }}
      />

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

import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';

import {
  AppScreen,
  DetailRow,
  InfoPill,
  OptionChip,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { env } from '../../config/env';
import { conditionOptions, ingredientSensitivityOptions, symptomOptions } from '../../data/catalog';
import { useInsightsData } from '../../features/insights/hooks';
import { apiClient } from '../../services/api/client';
import { signOutSupabase } from '../../services/auth';
import { trackEvent } from '../../services/analytics';
import {
  getMealFollowupNotificationStatus,
  registerMealFollowupNotifications,
  syncLocalMealFollowupNotification,
} from '../../services/notifications';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const authUser = useAppStore((state) => state.authUser);
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackBilling = useAppStore((state) => state.billing);
  const meals = useAppStore((state) => state.meals);
  const scans = useAppStore((state) => state.scans);
  const updateProfileSettings = useAppStore((state) => state.updateProfileSettings);
  const insightsQuery = useInsightsData('');
  const profile = insightsQuery.data?.profile ?? fallbackProfile;
  const billing = insightsQuery.data?.billing ?? fallbackBilling;
  const [selectedConditions, setSelectedConditions] = useState<string[]>(profile?.knownConditions ?? []);
  const [selectedSensitivities, setSelectedSensitivities] = useState<string[]>(profile?.knownIngredientSensitivities ?? []);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>(profile?.commonSymptoms ?? []);
  const [busySection, setBusySection] = useState<'profile' | 'notifications' | 'delete' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    setSelectedConditions(profile?.knownConditions ?? []);
    setSelectedSensitivities(profile?.knownIngredientSensitivities ?? []);
    setSelectedSymptoms(profile?.commonSymptoms ?? []);
  }, [profile?.commonSymptoms, profile?.knownConditions, profile?.knownIngredientSensitivities]);

  useEffect(() => {
    void getMealFollowupNotificationStatus()
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

  async function handleEnableNotifications() {
    setBusySection('notifications');
    setStatusMessage(null);
    try {
      await registerMealFollowupNotifications();
      await Promise.all(
        meals
          .filter((meal) => meal.followupState === 'pending')
          .map((meal) => syncLocalMealFollowupNotification(meal, scans.find((scan) => scan.id === meal.scanId))),
      );
      setNotificationsEnabled(true);
      setStatusMessage('Meal follow-up notifications are enabled.');
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
      <ScreenHeader
        eyebrow="Profile & settings"
        title="Settings"
        subtitle="Manage your stomach profile, tokens, subscription, legal surfaces, and support details."
      />

      <SectionCard>
        <Text>Account</Text>
        <DetailRow label="Email" value={authUser?.email ?? 'Not connected'} />
        <DetailRow label="Provider" value={authUser?.provider ?? 'No active session'} />
        <SecondaryButton label="Sign out" onPress={() => void signOutSupabase()} />
      </SectionCard>

      <SectionCard>
        <Text>Stomach profile</Text>
        <Text>Known conditions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {conditionOptions.map((option) => (
            <OptionChip
              key={option}
              label={option}
              selected={selectedConditions.includes(option)}
              onPress={() => toggleValue(selectedConditions, setSelectedConditions, option)}
            />
          ))}
        </View>
        <Text>Known sensitivities</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {ingredientSensitivityOptions.map((option) => (
            <OptionChip
              key={option}
              label={option}
              selected={selectedSensitivities.includes(option)}
              onPress={() => toggleValue(selectedSensitivities, setSelectedSensitivities, option)}
            />
          ))}
        </View>
        <Text>Common symptoms</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {symptomOptions.map((option) => (
            <OptionChip
              key={option}
              label={option}
              selected={selectedSymptoms.includes(option)}
              onPress={() => toggleValue(selectedSymptoms, setSelectedSymptoms, option)}
            />
          ))}
        </View>
        <PrimaryButton
          label={busySection === 'profile' ? 'Saving…' : 'Save stomach profile'}
          onPress={() => void handleSaveProfile()}
          disabled={busySection !== null}
        />
      </SectionCard>

      <SectionCard>
        <Text>Subscription</Text>
        <DetailRow label="Status" value={billing.subscriptionStatus} />
        <DetailRow label="Plan" value={billing.selectedPlan} />
        <DetailRow label="Trial ends" value={billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : '—'} />
      </SectionCard>

      <SectionCard>
        <Text>Tokens</Text>
        <DetailRow label="Remaining" value={`${billing.tokensRemaining}`} />
        <Text>Top-ups stay hidden until live App Store products are configured.</Text>
      </SectionCard>

      <SectionCard>
        <Text>Notifications</Text>
        <DetailRow label="Purpose" value="Meal follow-ups only" />
        <DetailRow label="Status" value={notificationsEnabled ? 'Enabled' : 'Not enabled'} />
        <PrimaryButton
          label={busySection === 'notifications' ? 'Enabling…' : notificationsEnabled ? 'Refresh notification access' : 'Enable follow-ups'}
          onPress={() => void handleEnableNotifications()}
          disabled={busySection !== null}
        />
      </SectionCard>

      <SectionCard>
        <Text>Legal / support</Text>
        <SecondaryButton
          label="Privacy policy"
          onPress={() => openLegalSurface(env.privacyUrl, () => navigation.navigate('LegalDocument', { document: 'privacy' }))}
        />
        <SecondaryButton
          label="Terms of service"
          onPress={() => openLegalSurface(env.termsUrl, () => navigation.navigate('LegalDocument', { document: 'terms' }))}
        />
        <SecondaryButton label="Delete account / data" onPress={() => openDeleteConfirmation(() => void handleDeleteAccount())} />
        <SecondaryButton label="Contact support" onPress={() => openIfPresent(`mailto:${env.supportEmail}`)} />
      </SectionCard>

      {statusMessage ? <InfoPill label={statusMessage} tone="soft" /> : null}
    </AppScreen>
  );
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

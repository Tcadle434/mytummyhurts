import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppleButton } from '@invertase/react-native-apple-authentication';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';

import { AppScreen, InfoPill, InputField, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { signInWithApple, signInWithEmail, signInWithGoogle } from '../../services/auth';
import { palette, radii, spacing } from '../../theme';
import { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingAuth'>;

export function AuthScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [busyProvider, setBusyProvider] = useState<'apple' | 'google' | 'email' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleProvider(provider: 'apple' | 'google' | 'email') {
    setBusyProvider(provider);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      if (provider === 'apple') {
        await signInWithApple();
        navigation.replace('FirstScanLanding');
        return;
      }

      if (provider === 'google') {
        await signInWithGoogle();
        navigation.replace('FirstScanLanding');
        return;
      }

      await signInWithEmail(email);
      setStatusMessage('Magic link sent. Open it on this device to finish linking your account.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Account creation"
        title="Create your account"
        subtitle="Your profile and subscription will attach here so scans, history, and insights stay in sync."
      />

      <SectionCard>
        <InfoPill label="Auth is now wired to live Supabase providers." tone="soft" />
        {Platform.OS === 'ios' ? (
          <AppleButton
            buttonStyle={AppleButton.Style.BLACK}
            buttonType={AppleButton.Type.CONTINUE}
            cornerRadius={radii.md}
            style={styles.appleButton}
            onPress={() => void handleProvider('apple')}
          />
        ) : null}
        <SecondaryButton
          label={busyProvider === 'google' ? 'Connecting Google…' : 'Continue with Google'}
          onPress={() => void handleProvider('google')}
          disabled={busyProvider !== null}
        />
      </SectionCard>

      <SectionCard>
        <Text>Use email instead</Text>
        <InputField value={email} placeholder="you@example.com" onChangeText={setEmail} />
        <PrimaryButton
          label={busyProvider === 'email' ? 'Sending link…' : 'Continue with email'}
          onPress={() => void handleProvider('email')}
          disabled={busyProvider !== null}
        />
        {busyProvider ? (
          <View style={styles.feedbackRow}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.feedbackText}>Working on {busyProvider} sign-in…</Text>
          </View>
        ) : null}
        {statusMessage ? <InfoPill label={statusMessage} tone="soft" /> : null}
        {errorMessage ? <InfoPill label={errorMessage} tone="warm" /> : null}
      </SectionCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    height: 54,
    borderRadius: radii.md,
  },
  feedbackRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackText: {
    color: palette.textMuted,
  },
});

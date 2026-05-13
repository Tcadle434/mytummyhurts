import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppleButton } from '@invertase/react-native-apple-authentication';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, InfoPill, InputField, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import {
  signInWithApple,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
} from '../../services/auth';
import { useAppStore } from '../../store/useAppStore';
import { palette, radii, spacing } from '../../theme';
import { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingAuth'>;

export function AuthScreen({ navigation }: Props) {
  const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyProvider, setBusyProvider] = useState<'apple' | 'google' | 'signIn' | 'signUp' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busyMessage = busyProvider === 'signIn' ? 'signing in' : busyProvider === 'signUp' ? 'creating your account' : `${busyProvider} sign-in`;

  function returnToPaywall() {
    setOnboardingStage('paywall');
    navigation.replace('OnboardingPaywall');
  }

  async function handleProvider(provider: 'apple' | 'google') {
    setBusyProvider(provider);
    setErrorMessage(null);

    try {
      if (provider === 'apple') {
        await signInWithApple();
        navigation.replace('FirstScanLanding');
        return;
      }

      await signInWithGoogle();
      navigation.replace('FirstScanLanding');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleEmailAuth(mode: 'signIn' | 'signUp') {
    setBusyProvider(mode);
    setErrorMessage(null);

    try {
      if (mode === 'signIn') {
        await signInWithEmailPassword(email, password);
      } else {
        await signUpWithEmailPassword(email, password);
      }
      navigation.replace('FirstScanLanding');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <AppScreen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to paywall"
        onPress={returnToPaywall}
        style={({ pressed }) => [styles.tempBackButton, pressed && { opacity: 0.72 }]}
      >
        <Ionicons name="arrow-back" size={22} color={palette.primary} />
      </Pressable>

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
        <Text>Email and password</Text>
        <InputField
          value={email}
          placeholder="you@example.com"
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <InputField
          value={password}
          placeholder="Password"
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete="password"
          secureTextEntry
          textContentType="password"
        />
        <PrimaryButton
          label={busyProvider === 'signIn' ? 'Signing in…' : 'Sign in'}
          onPress={() => void handleEmailAuth('signIn')}
          disabled={busyProvider !== null}
        />
        <SecondaryButton
          label={busyProvider === 'signUp' ? 'Creating account…' : 'Create account'}
          onPress={() => void handleEmailAuth('signUp')}
          disabled={busyProvider !== null}
        />
        {busyProvider ? (
          <View style={styles.feedbackRow}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.feedbackText}>Working on {busyMessage}…</Text>
          </View>
        ) : null}
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
  tempBackButton: {
    alignItems: 'center',
    backgroundColor: palette.sageSoft,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 40,
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

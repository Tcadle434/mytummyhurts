import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppleButton } from '@invertase/react-native-apple-authentication';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import {
  signInWithApple,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
} from '../../services/auth';
import { useAppStore } from '../../store/useAppStore';
import { radii } from '../../theme';
import { OnboardingStackParamList } from '../../navigation/types';
import { AuthAccountContent, AuthProviderButton } from './AuthAccountContent';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingAuth'>;

export function AuthScreen({ navigation }: Props) {
  const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyProvider, setBusyProvider] = useState<'apple' | 'google' | 'signIn' | 'signUp' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busyMessage = busyProvider === 'signIn' ? 'signing in' : busyProvider === 'signUp' ? 'creating your account' : `${busyProvider} sign-in`;

  function finishAuth() {
    setOnboardingStage('complete');
  }

  async function handleProvider(provider: 'apple' | 'google') {
    setBusyProvider(provider);
    setErrorMessage(null);

    try {
      if (provider === 'apple') {
        await signInWithApple();
        finishAuth();
        return;
      }

      await signInWithGoogle();
      finishAuth();
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
      finishAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <AuthAccountContent
      email={email}
      password={password}
      busy={busyProvider !== null}
      busyMessage={busyMessage}
      errorMessage={errorMessage}
      emailMode="signUp"
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSignIn={() => void handleEmailAuth('signIn')}
      onCreateAccount={() => void handleEmailAuth('signUp')}
      onToggleEmailMode={() => navigation.replace('OnboardingSignIn')}
      providerSlot={
        <>
          {Platform.OS === 'ios' ? (
          <AppleButton
            buttonStyle={AppleButton.Style.BLACK}
            buttonType={AppleButton.Type.CONTINUE}
            cornerRadius={radii.md}
            style={styles.appleButton}
            onPress={() => void handleProvider('apple')}
          />
          ) : null}
          <AuthProviderButton
            label={busyProvider === 'google' ? 'Connecting Google...' : 'Continue with Google'}
            onPress={() => void handleProvider('google')}
            disabled={busyProvider !== null}
          />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  appleButton: {
    height: 50,
    borderRadius: radii.md,
  },
});

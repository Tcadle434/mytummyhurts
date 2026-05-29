import { AppleButton } from '@invertase/react-native-apple-authentication';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import {
  signInWithApple,
  signInWithEmailPassword,
  signInWithGoogle,
} from '../../services/auth';
import { OnboardingStackParamList } from '../../navigation/types';
import { radii } from '../../theme';
import { AuthAccountContent, AuthProviderButton } from './AuthAccountContent';
import { verifyExistingAccountSignIn } from './existingAccountGate';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingSignIn'>;
type BusyProvider = 'apple' | 'google' | 'signIn';

export function ExistingAccountSignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyProvider, setBusyProvider] = useState<BusyProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busyMessage =
    busyProvider === 'signIn' ? 'signing in' : `${busyProvider ?? 'account'} sign-in`;

  function returnToGetStarted() {
    navigation.replace('GetStarted');
  }

  async function finishExistingSignIn(cleanupFreshUnentitledUser: boolean) {
    return verifyExistingAccountSignIn({
      cleanupFreshUnentitledUser,
      onRejected: returnToGetStarted,
    });
  }

  async function handleProvider(provider: 'apple' | 'google') {
    setBusyProvider(provider);
    setErrorMessage(null);

    try {
      if (provider === 'apple') {
        await signInWithApple();
      } else {
        await signInWithGoogle();
      }

      await finishExistingSignIn(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleEmailSignIn() {
    setBusyProvider('signIn');
    setErrorMessage(null);

    try {
      await signInWithEmailPassword(email, password);
      await finishExistingSignIn(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.';
      setErrorMessage(message);
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <AuthAccountContent
      eyebrow="Existing account"
      title="Sign in"
      subtitle="Welcome back. Sign in to continue."
      email={email}
      password={password}
      busy={busyProvider !== null}
      busyMessage={busyMessage}
      errorMessage={errorMessage}
      emailMode="signIn"
      onToggleEmailMode={() => navigation.replace('OnboardingAuth')}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSignIn={() => void handleEmailSignIn()}
      onCreateAccount={() => undefined}
      providerSlot={
        <>
          {Platform.OS === 'ios' ? (
            <AppleButton
              buttonStyle={AppleButton.Style.BLACK}
              buttonType={AppleButton.Type.SIGN_IN}
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

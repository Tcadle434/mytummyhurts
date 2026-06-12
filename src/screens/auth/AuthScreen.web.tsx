import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';

import { signInWithEmailPassword, signInWithGoogle, signUpWithEmailPassword } from '../../services/auth';
import { useAppStore } from '../../store/useAppStore';
import { OnboardingStackParamList } from '../../navigation/types';
import { AuthAccountContent, AuthProviderButton } from './AuthAccountContent';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingAuth'>;

export function AuthScreen({ navigation }: Props) {
  const completeAuthSetup = useAppStore((state) => state.completeAuthSetup);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busyProvider, setBusyProvider] = useState<'google' | 'signIn' | 'signUp' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busyMessage = busyProvider === 'signIn' ? 'signing in' : busyProvider === 'signUp' ? 'creating your account' : `${busyProvider} sign-in`;

  async function handleProvider() {
    setBusyProvider('google');
    setErrorMessage(null);

    try {
      await signInWithGoogle();
      await completeAuthSetup();
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
      await completeAuthSetup();
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
        <AuthProviderButton
          label={busyProvider === 'google' ? 'Connecting Google...' : 'Continue with Google'}
          onPress={() => void handleProvider()}
          disabled={busyProvider !== null}
        />
      }
    />
  );
}

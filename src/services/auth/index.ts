import { appleAuth } from '@invertase/react-native-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { env, isAppleAuthConfigured, isGoogleAuthConfigured } from '../../config/env';
import { useAppStore } from '../../store/useAppStore';
import { createId } from '../../utils/id';
import {
  nestAppleSignIn,
  nestEmailSignIn,
  nestEmailSignUp,
  nestGoogleSignIn,
  nestRestoreSession,
  nestSignOut,
} from './nestSession';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({
  scheme: env.appScheme,
  path: 'auth/callback',
});

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// Obtain a Google ID token directly and hand it to /v1/auth/google.
async function getGoogleIdToken(): Promise<string> {
  const clientId = env.googleIosClientId || env.googleWebClientId;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'email', 'profile'],
    redirectUri: redirectTo,
    responseType: AuthSession.ResponseType.IdToken,
    extraParams: { nonce: createId('google') },
  });
  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type !== 'success' || !result.params.id_token) {
    throw new Error('Google sign-in was canceled before completion.');
  }
  return result.params.id_token;
}

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured) {
    throw new Error('Google sign-in is not configured.');
  }
  const idToken = await getGoogleIdToken();
  return nestGoogleSignIn(idToken);
}

export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple sign-in is only available on iOS.');
  }
  if (!isAppleAuthConfigured) {
    throw new Error('Apple sign-in is not configured.');
  }

  const rawNonce = createId('apple');
  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    nonce: rawNonce,
  });

  if (!response.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  return nestAppleSignIn(response.identityToken, rawNonce);
}

function normalizeEmailPassword(email: string, password: string) {
  const resolvedEmail = email.trim();
  if (!resolvedEmail) {
    throw new Error('Enter an email address to continue.');
  }

  if (!password) {
    throw new Error('Enter a password to continue.');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  return { email: resolvedEmail, password };
}

export async function signInWithEmailPassword(email: string, password: string) {
  const credentials = normalizeEmailPassword(email, password);
  return nestEmailSignIn(credentials.email, credentials.password);
}

export async function signUpWithEmailPassword(email: string, password: string) {
  const credentials = normalizeEmailPassword(email, password);
  return nestEmailSignUp(credentials.email, credentials.password);
}

export function restoreSession() {
  return nestRestoreSession();
}

export async function signOut() {
  await nestSignOut();
  useAppStore.getState().signOut();
}

export function getAuthRedirectUrl() {
  return redirectTo;
}

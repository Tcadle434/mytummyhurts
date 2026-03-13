import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env, isAppleAuthConfigured, isGoogleAuthConfigured } from '../../config/env';
import { requireSupabaseClient, supabase } from '../supabase/client';
import { useAppStore } from '../../store/useAppStore';
import { AppUser, AuthProvider } from '../../types/domain';
import { createId } from '../../utils/id';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({
  scheme: env.appScheme,
  path: 'auth/callback',
});

function deriveProvider(session: Session): AuthProvider {
  const provider =
    session.user.app_metadata.provider ??
    session.user.identities?.[0]?.provider ??
    'email';

  if (provider === 'google' || provider === 'apple') {
    return provider;
  }

  return 'email';
}

export function syncSessionToStore(session: Session | null) {
  if (!session?.user) {
    return null;
  }

  const user: AppUser = {
    id: session.user.id,
    email: session.user.email ?? 'unknown@mytummyhurts.app',
    provider: deriveProvider(session),
    createdAt: session.user.created_at ?? new Date().toISOString(),
  };

  useAppStore.getState().syncAuthUser(user);
  return user;
}

function readUrlParam(url: URL, key: string) {
  return url.searchParams.get(key) ?? new URLSearchParams(url.hash.replace(/^#/, '')).get(key);
}

async function completeOAuthRedirect(urlValue: string) {
  const url = new URL(urlValue);
  const code = readUrlParam(url, 'code');
  if (code) {
    const { data, error } = await requireSupabaseClient().auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }

    return data.session;
  }

  const accessToken = readUrlParam(url, 'access_token');
  const refreshToken = readUrlParam(url, 'refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await requireSupabaseClient().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw error;
    }

    return data.session;
  }

  const errorMessage = readUrlParam(url, 'error_description') ?? readUrlParam(url, 'error');
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  throw new Error('The OAuth provider returned without a session.');
}

export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured) {
    throw new Error('Google sign-in is not configured.');
  }

  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error('Supabase did not return a Google authorization URL.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was canceled before completion.');
  }

  const session = await completeOAuthRedirect(result.url);
  return syncSessionToStore(session);
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

  const { data, error } = await requireSupabaseClient().auth.signInWithIdToken({
    provider: 'apple',
    token: response.identityToken,
    nonce: rawNonce,
  });

  if (error) {
    throw error;
  }

  return syncSessionToStore(data.session);
}

export async function signInWithEmail(email: string) {
  const resolvedEmail = email.trim();
  if (!resolvedEmail) {
    throw new Error('Enter an email address to continue.');
  }

  const { error } = await requireSupabaseClient().auth.signInWithOtp({
    email: resolvedEmail,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    throw error;
  }
}

export async function restoreSupabaseSession() {
  if (!supabase) {
    return null;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return syncSessionToStore(session);
}

export async function signOutSupabase() {
  if (!supabase) {
    useAppStore.getState().signOut();
    return;
  }

  await supabase.auth.signOut();
  useAppStore.getState().signOut();
}

export function getAuthRedirectUrl() {
  return redirectTo;
}

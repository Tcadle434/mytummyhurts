// Self-hosted auth client: stores access + rotating refresh tokens in
// expo-secure-store, transparently refreshes the access token, and calls the
// NestJS /v1/auth/* endpoints. Active when EXPO_PUBLIC_API_URL is set.
//
// NOTE: the OAuth flows (Apple nonce binding, Google direct-ID-token) require
// on-device testing — they can't be validated headlessly.
import * as SecureStore from 'expo-secure-store';

import { env } from '../../config/env';
import { useAppStore } from '../../store/useAppStore';
import { AppUser, AuthProvider } from '../../types/domain';

const SESSION_KEY = 'mth_session_v1';
const REFRESH_SKEW_MS = 30_000;

interface ServerUser {
  id: string;
  email?: string | null;
  provider?: string | null;
}
interface ServerSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ServerUser;
}
interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: ServerUser;
}

let cached: StoredSession | null | undefined;
let refreshInFlight: Promise<string | null> | null = null;

function apiBase(): string {
  return env.apiUrl.replace(/\/$/, '');
}

async function persist(session: StoredSession | null): Promise<void> {
  cached = session;
  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

async function load(): Promise<StoredSession | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  cached = raw ? (JSON.parse(raw) as StoredSession) : null;
  return cached;
}

async function postAuth(path: string, body: object): Promise<ServerSession> {
  const res = await fetch(`${apiBase()}/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & Partial<ServerSession>;
  if (!res.ok) throw new Error(json?.error?.message ?? `Auth ${path} request failed.`);
  return json as ServerSession;
}

function toAppUser(user: ServerUser): AppUser {
  const provider: AuthProvider =
    user.provider === 'google' || user.provider === 'apple' ? user.provider : 'email';
  return {
    id: user.id,
    email: user.email ?? 'unknown@mytummyhurts.app',
    provider,
    createdAt: new Date().toISOString(),
  };
}

async function applySession(session: ServerSession): Promise<AppUser> {
  await persist({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: Date.now() + (session.expiresIn ?? 900) * 1000 - REFRESH_SKEW_MS,
    user: session.user,
  });
  const appUser = toAppUser(session.user);
  useAppStore.getState().syncAuthUser(appUser);
  return appUser;
}

export function nestAppleSignIn(identityToken: string, nonce: string) {
  return postAuth('apple', { identityToken, nonce }).then(applySession);
}
export function nestGoogleSignIn(idToken: string) {
  return postAuth('google', { idToken }).then(applySession);
}
export function nestEmailSignIn(email: string, password: string) {
  return postAuth('email/sign-in', { email, password }).then(applySession);
}
export function nestEmailSignUp(email: string, password: string) {
  return postAuth('email/sign-up', { email, password }).then(applySession);
}

export async function nestSignOut(): Promise<void> {
  const session = await load();
  if (session) {
    try {
      await postAuth('sign-out', { refreshToken: session.refreshToken });
    } catch {
      // ignore — clear locally regardless
    }
  }
  await persist(null);
}

export async function nestRestoreSession(): Promise<AppUser | null> {
  const session = await load();
  if (!session) return null;
  const appUser = toAppUser(session.user);
  useAppStore.getState().syncAuthUser(appUser);
  return appUser;
}

/** Valid access token for API calls, refreshing transparently (single-flight). */
export async function getNestAccessToken(): Promise<string | null> {
  const session = await load();
  if (!session) return null;
  if (Date.now() < session.expiresAt) return session.accessToken;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const next = await postAuth('refresh', { refreshToken: session.refreshToken });
        await applySession(next);
        return next.accessToken;
      } catch {
        await persist(null);
        useAppStore.getState().signOut();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

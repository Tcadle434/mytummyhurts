import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseModule } from '../src/database/database.module';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });

const EMAIL = 'auth-int-test@test.dev';
let auth: AuthService;

async function purge() {
  await admin`delete from public.users where email = ${EMAIL}`;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuthModule],
  }).compile();
  auth = moduleRef.get(AuthService);
  await purge();
});

afterAll(async () => {
  await purge();
  await admin.end();
});

describe('email auth', () => {
  let refreshToken: string;

  it('signs up and returns a session + creates the user + profile', async () => {
    const s = await auth.signUpWithEmail(EMAIL, 'hunter2hunter2');
    expect(s.accessToken).toBeTruthy();
    expect(s.refreshToken).toBeTruthy();
    expect(s.user.provider).toBe('email');
    const [u] = await admin`select id from public.users where email = ${EMAIL}`;
    expect(u).toBeTruthy();
    const [p] = await admin`select user_id from public.user_profiles where user_id = ${u.id}`;
    expect(p).toBeTruthy();
    refreshToken = s.refreshToken;
  });

  it('rejects duplicate sign-up', async () => {
    await expect(auth.signUpWithEmail(EMAIL, 'whatever12345')).rejects.toThrow();
  });

  it('signs in with correct password', async () => {
    const s = await auth.signInWithEmail(EMAIL, 'hunter2hunter2');
    expect(s.accessToken).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    await expect(auth.signInWithEmail(EMAIL, 'wrongwrong123')).rejects.toThrow();
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const rotated = await auth.refresh(refreshToken);
    expect(rotated.refreshToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(refreshToken);
    // Re-using the now-rotated token must fail (reuse detection).
    await expect(auth.refresh(refreshToken)).rejects.toThrow();
  });
});

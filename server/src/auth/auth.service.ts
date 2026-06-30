import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AppleVerifier } from './verifiers/apple.verifier';
import { GoogleVerifier } from './verifiers/google.verifier';

interface UserRow {
  id: string;
  email?: string | null;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email?: string | null; provider: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly apple: AppleVerifier,
    private readonly google: GoogleVerifier,
  ) {}

  private async issueSession(
    user: UserRow,
    provider: string,
    userAgent?: string,
  ): Promise<SessionResponse> {
    const access = await this.tokens.mintAccess({ id: user.id, email: user.email, provider });
    const refresh = await this.tokens.issueRefresh(user.id, undefined, null, userAgent);
    return {
      accessToken: access.accessToken,
      refreshToken: refresh.refreshToken,
      expiresIn: access.expiresIn,
      user: { id: user.id, email: user.email, provider },
    };
  }

  /** Look up or create the public.users + profile + identity for an OAuth subject. */
  async upsertUserFromIdentity(
    provider: 'apple' | 'google',
    subject: string,
    email: string | null,
  ): Promise<UserRow> {
    return this.db.service(async (sql) => {
      const [identity] = await sql`
        select user_id from public.auth_identities
        where provider = ${provider} and provider_subject = ${subject}`;
      if (identity) {
        const [user] = await sql`select id, email from public.users where id = ${identity.user_id}`;
        return user as UserRow;
      }
      const id = randomUUID();
      await sql`insert into public.users (id, email) values (${id}, ${email})`;
      await sql`insert into public.user_profiles (user_id) values (${id}) on conflict do nothing`;
      await sql`insert into public.auth_identities (user_id, provider, provider_subject, email)
                values (${id}, ${provider}, ${subject}, ${email})`;
      return { id, email };
    });
  }

  async signInWithApple(identityToken: string, nonce: string | undefined, ua?: string) {
    const { subject, email } = await this.apple.verify(identityToken, nonce);
    const user = await this.upsertUserFromIdentity('apple', subject, email);
    return this.issueSession(user, 'apple', ua);
  }

  async signInWithGoogle(idToken: string, ua?: string) {
    const { subject, email } = await this.google.verify(idToken);
    const user = await this.upsertUserFromIdentity('google', subject, email);
    return this.issueSession(user, 'google', ua);
  }

  async signUpWithEmail(email: string, password: string, ua?: string): Promise<SessionResponse> {
    const subject = email.trim().toLowerCase();
    const { hash, algo } = await this.passwords.hash(password);
    const user = await this.db.service(async (sql) => {
      const [existing] = await sql`
        select 1 from public.auth_identities
        where provider = 'email' and provider_subject = ${subject}`;
      if (existing) throw new ConflictException('email_in_use');
      const id = randomUUID();
      await sql`insert into public.users (id, email) values (${id}, ${email})`;
      await sql`insert into public.user_profiles (user_id) values (${id}) on conflict do nothing`;
      await sql`insert into public.auth_identities (user_id, provider, provider_subject, email)
                values (${id}, 'email', ${subject}, ${email})`;
      await sql`insert into public.auth_credentials (user_id, password_hash, algo)
                values (${id}, ${hash}, ${algo})`;
      return { id, email } as UserRow;
    });
    return this.issueSession(user, 'email', ua);
  }

  async signInWithEmail(email: string, password: string, ua?: string): Promise<SessionResponse> {
    const subject = email.trim().toLowerCase();
    const user = await this.db.service(async (sql) => {
      const [identity] = await sql`
        select user_id from public.auth_identities
        where provider = 'email' and provider_subject = ${subject}`;
      if (!identity) return null;
      const [cred] = await sql`
        select password_hash, algo from public.auth_credentials where user_id = ${identity.user_id}`;
      if (!cred) return null;
      const { ok, needsRehash } = await this.passwords.verify(
        cred.password_hash,
        cred.algo,
        password,
      );
      if (!ok) return null;
      if (needsRehash) {
        const { hash, algo } = await this.passwords.hash(password);
        await sql`update public.auth_credentials
                  set password_hash = ${hash}, algo = ${algo}, updated_at = now()
                  where user_id = ${identity.user_id}`;
      }
      const [u] = await sql`select id, email from public.users where id = ${identity.user_id}`;
      return u as UserRow;
    });
    if (!user) throw new UnauthorizedException('invalid_credentials');
    return this.issueSession(user, 'email', ua);
  }

  async refresh(refreshToken: string, ua?: string) {
    const { user, refreshToken: next } = await this.tokens.rotate(refreshToken, ua);
    const access = await this.tokens.mintAccess({ id: user.id, email: user.email });
    return {
      accessToken: access.accessToken,
      refreshToken: next,
      expiresIn: access.expiresIn,
      user: { id: user.id, email: user.email },
    };
  }

  async signOut(refreshToken: string): Promise<{ ok: true }> {
    await this.tokens.revokeFamilyByToken(refreshToken);
    return { ok: true };
  }

  // Onboarding gate: a user may proceed if they are entitled AND have a
  // meaningful profile. Fresh, unentitled orphans (< 10 min old) can be cleaned
  // up. Ports auth-existing-account-check.
  async existingAccountCheck(userId: string, cleanupFreshUnentitledUser = false) {
    const ENTITLED = ['trialing', 'active', 'in_grace'];
    const FRESH_ORPHAN_WINDOW_MS = 10 * 60 * 1000;
    return this.db.service(async (sql) => {
      const [u] = await sql`select subscription_status, created_at from public.users where id = ${userId}`;
      if (!u) return { ok: true as const, allowed: false, reason: 'not_found' as const };

      const entitled = ENTITLED.includes(u.subscription_status as string);
      const [p] = await sql`
        select known_conditions, known_ingredient_sensitivities, common_symptoms
        from public.user_profiles where user_id = ${userId}`;
      const hasProfile = Boolean(
        p &&
          (((p.known_conditions as unknown[]) ?? []).length > 0 ||
            ((p.known_ingredient_sensitivities as unknown[]) ?? []).length > 0 ||
            ((p.common_symptoms as unknown[]) ?? []).length > 0),
      );

      if (entitled && hasProfile) return { ok: true as const, allowed: true };

      if (cleanupFreshUnentitledUser && !entitled) {
        const ageMs = Date.now() - new Date(u.created_at as string).getTime();
        if (ageMs < FRESH_ORPHAN_WINDOW_MS) {
          await sql`delete from public.users where id = ${userId}`;
          return { ok: true as const, allowed: false, reason: 'fresh_orphan_deleted' as const, deletedOrphan: true };
        }
      }
      return {
        ok: true as const,
        allowed: false,
        reason: entitled ? ('incomplete_profile' as const) : ('missing_entitlement' as const),
      };
    });
  }
}

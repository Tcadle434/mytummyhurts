import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

import { DatabaseService } from '../database/database.service';

export interface AccessClaims {
  sub: string;
  email?: string | null;
  provider?: string | null;
}

interface UserRef {
  id: string;
  email?: string | null;
  provider?: string | null;
}

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly accessTtl: number;
  private readonly refreshTtlMs: number;

  constructor(
    config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    this.secret = new TextEncoder().encode(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
    this.accessTtl = Number(config.get('JWT_ACCESS_TTL_SECONDS') ?? 900);
    this.refreshTtlMs = Number(config.get('JWT_REFRESH_TTL_DAYS') ?? 60) * 86_400_000;
  }

  async mintAccess(user: UserRef): Promise<{ accessToken: string; expiresIn: number }> {
    const accessToken = await new SignJWT({
      email: user.email ?? null,
      provider: user.provider ?? null,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtl}s`)
      .sign(this.secret);
    return { accessToken, expiresIn: this.accessTtl };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.secret);
    return {
      sub: payload.sub as string,
      email: (payload as Record<string, unknown>).email as string | null,
      provider: (payload as Record<string, unknown>).provider as string | null,
    };
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  async issueRefresh(
    userId: string,
    familyId: string = randomUUID(),
    parentId: string | null = null,
    userAgent?: string,
  ): Promise<{ refreshToken: string; familyId: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.db.service(
      (sql) => sql`
        insert into public.auth_refresh_tokens
          (user_id, token_hash, family_id, parent_id, expires_at, user_agent)
        values (${userId}, ${this.sha256(token)}, ${familyId}, ${parentId},
                ${expiresAt}, ${userAgent ?? null})`,
    );
    return { refreshToken: token, familyId };
  }

  /** Rotate a refresh token. Reuse of an already-rotated token revokes the family. */
  async rotate(
    refreshToken: string,
    userAgent?: string,
  ): Promise<{ user: UserRef; refreshToken: string }> {
    const hash = this.sha256(refreshToken);
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from public.auth_refresh_tokens where token_hash = ${hash}`;
      if (!row) throw new UnauthorizedException('invalid_refresh');
      if (row.revoked_at) {
        await sql`update public.auth_refresh_tokens set revoked_at = now()
                  where family_id = ${row.family_id} and revoked_at is null`;
        throw new UnauthorizedException('refresh_reuse');
      }
      if (new Date(row.expires_at) < new Date()) throw new UnauthorizedException('refresh_expired');
      await sql`update public.auth_refresh_tokens set revoked_at = now() where id = ${row.id}`;
      const next = await this.issueRefresh(row.user_id, row.family_id, row.id, userAgent);
      const [user] = await sql`select id, email from public.users where id = ${row.user_id}`;
      return { user: user as UserRef, refreshToken: next.refreshToken };
    });
  }

  async revokeFamilyByToken(refreshToken: string): Promise<void> {
    const hash = this.sha256(refreshToken);
    await this.db.service(
      (sql) => sql`
        update public.auth_refresh_tokens set revoked_at = now()
        where family_id = (select family_id from public.auth_refresh_tokens where token_hash = ${hash})
          and revoked_at is null`,
    );
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

@Injectable()
export class AppleVerifier {
  private readonly jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );

  constructor(private readonly config: ConfigService) {}

  async verify(
    identityToken: string,
    rawNonce?: string,
  ): Promise<{ subject: string; email: string | null }> {
    const audience = this.config.get<string>('APPLE_BUNDLE_ID') || undefined;
    let payload;
    try {
      ({ payload } = await jwtVerify(identityToken, this.jwks, {
        issuer: 'https://appleid.apple.com',
        audience,
      }));
    } catch {
      throw new UnauthorizedException('apple_token_invalid');
    }

    // Apple returns the SHA-256 hex of the raw nonce the client supplied.
    const tokenNonce = (payload as Record<string, unknown>).nonce as string | undefined;
    if (rawNonce && tokenNonce) {
      const hashed = createHash('sha256').update(rawNonce).digest('hex');
      if (tokenNonce !== rawNonce && tokenNonce !== hashed) {
        throw new UnauthorizedException('apple_nonce_mismatch');
      }
    }

    return {
      subject: payload.sub as string,
      email: ((payload as Record<string, unknown>).email as string) ?? null,
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

@Injectable()
export class GoogleVerifier {
  private readonly jwks: JWTVerifyGetKey = createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
  );

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<{ subject: string; email: string | null }> {
    const audiences = [
      this.config.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.config.get<string>('GOOGLE_WEB_CLIENT_ID'),
    ].filter((v): v is string => Boolean(v));

    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, this.jwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: audiences.length ? audiences : undefined,
      }));
    } catch {
      throw new UnauthorizedException('google_token_invalid');
    }

    return {
      subject: payload.sub as string,
      email: ((payload as Record<string, unknown>).email as string) ?? null,
    };
  }
}

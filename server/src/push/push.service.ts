import { Injectable, Logger } from '@nestjs/common';

export interface PushPayload {
  pushToken: string;
  alert: { title: string; body: string };
  data?: Record<string, string>;
}

/**
 * APNs push — ported from _shared/apns.ts (Node's global WebCrypto + fetch).
 * Key-gated: a no-op returning { ok: false } when APNs creds are unset, so it is
 * always safe to call. NOTE: production should use an HTTP/2 client (node:http2 /
 * node-apn) since APNs requires HTTP/2; this fetch-based path is the structural
 * port and works where the runtime negotiates HTTP/2.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  private cachedToken: { value: string; expiresAt: number } | null = null;

  private base64UrlEncode(input: Uint8Array | string): string {
    const value = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...input));
    return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const normalized = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  private async createApnsToken(): Promise<string> {
    const keyId = process.env.APNS_KEY_ID ?? '';
    const teamId = process.env.APPLE_TEAM_ID ?? '';
    const authKey = process.env.APNS_AUTH_KEY ?? '';
    if (!authKey || !keyId || !teamId) throw new Error('apns_not_configured');
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.value;
    }

    const header = { alg: 'ES256', kid: keyId };
    const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
    const signingInput = `${this.base64UrlEncode(JSON.stringify(header))}.${this.base64UrlEncode(JSON.stringify(claims))}`;
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      this.pemToArrayBuffer(authKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(signingInput),
    );
    const token = `${signingInput}.${this.base64UrlEncode(new Uint8Array(signature))}`;
    this.cachedToken = { value: token, expiresAt: Date.now() + 45 * 60_000 };
    return token;
  }

  async sendNotification(payload: PushPayload): Promise<{ ok: boolean; status?: number; error?: string }> {
    const bundleId = process.env.IOS_BUNDLE_ID ?? process.env.APPLE_BUNDLE_ID ?? '';
    if (!bundleId) return { ok: false, error: 'apns_topic_missing' };
    let apnsToken: string;
    try {
      apnsToken = await this.createApnsToken();
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const res = await fetch(`https://api.push.apple.com/3/device/${payload.pushToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${apnsToken}`,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-topic': bundleId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: payload.alert, sound: 'default' }, ...payload.data }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, status: res.status, error: await res.text() };
  }
}

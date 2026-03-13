const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') ?? '';
const APPLE_TEAM_ID = Deno.env.get('APPLE_TEAM_ID') ?? '';
const IOS_BUNDLE_ID = Deno.env.get('IOS_BUNDLE_ID') ?? '';
const APNS_AUTH_KEY = Deno.env.get('APNS_AUTH_KEY') ?? '';

type PushPayload = {
  pushToken: string;
  alert: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
};

function base64UrlEncode(input: Uint8Array | string) {
  const value =
    typeof input === 'string'
      ? btoa(input)
      : btoa(String.fromCharCode(...input));

  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function createApnsToken() {
  if (!APNS_AUTH_KEY || !APNS_KEY_ID || !APPLE_TEAM_ID) {
    throw new Error('apns_not_configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const header = {
    alg: 'ES256',
    kid: APNS_KEY_ID,
  };

  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = {
    iss: APPLE_TEAM_ID,
    iat: issuedAt,
  };

  const encoder = new TextEncoder();
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(APNS_AUTH_KEY),
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    privateKey,
    encoder.encode(signingInput),
  );

  const token = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
  cachedToken = {
    value: token,
    expiresAt: Date.now() + 45 * 60_000,
  };

  return token;
}

export async function sendApnsNotification(payload: PushPayload) {
  if (!IOS_BUNDLE_ID) {
    throw new Error('apns_topic_missing');
  }

  const apnsToken = await createApnsToken();
  const response = await fetch(`https://api.push.apple.com/3/device/${payload.pushToken}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${apnsToken}`,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-topic': IOS_BUNDLE_ID,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: payload.alert,
        sound: 'default',
      },
      ...payload.data,
    }),
  });

  if (response.ok) {
    return { ok: true as const };
  }

  const errorText = await response.text();
  return {
    ok: false as const,
    status: response.status,
    error: errorText,
  };
}

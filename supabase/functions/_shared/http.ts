export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  code = 'bad_request',
  details?: Record<string, unknown>,
) {
  return jsonResponse(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, status = 400, code = 'bad_request', details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function apiErrorResponse(error: ApiError) {
  return errorResponse(error.message, error.status, error.code, error.details);
}

export async function readJsonBody<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

export function isOptionsRequest(request: Request) {
  return request.method.toUpperCase() === 'OPTIONS';
}

export function requireInternalSecret(request: Request, envKey = 'FOLLOWUP_DISPATCH_SECRET') {
  const expected = Deno.env.get(envKey) ?? '';
  if (!expected) {
    throw new Error('internal_secret_missing');
  }

  const provided =
    request.headers.get('x-dispatch-secret') ??
    request.headers.get('x-internal-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ??
    '';

  if (!provided || provided !== expected) {
    throw new Error('forbidden');
  }
}

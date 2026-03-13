import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  console.warn('[functions] Supabase environment is incomplete', {
    hasUrl: Boolean(supabaseUrl),
    hasServiceRole: Boolean(serviceRoleKey),
  });
}

export interface AuthUserContext {
  id: string;
  email: string | null;
}

export function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireUser(request: Request): Promise<AuthUserContext> {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('unauthorized');
  }

  const client = createAdminClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new Error('unauthorized');
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

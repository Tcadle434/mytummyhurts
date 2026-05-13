import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { env, isLiveBackendConfigured } from '../../config/env';

export const supabase = isLiveBackendConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase is not configured in the current environment.');
  }

  return supabase;
}

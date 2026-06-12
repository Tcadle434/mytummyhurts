import { useEffect } from 'react';

import { restoreSupabaseSession, syncSessionToStore } from '../../../services/auth';
import { supabase } from '../../../services/supabase/client';

export function SupabaseSessionBridge() {
  useEffect(() => {
    restoreSupabaseSession().catch((error) => {
      console.warn('[auth] failed to restore session', error);
    });

    if (!supabase) {
      return undefined;
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSessionToStore(session);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}

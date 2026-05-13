import { ReactNode, useEffect } from 'react';

import { useAppStore } from '../../store/useAppStore';
import { restoreSupabaseSession, syncSessionToStore } from '../../services/auth';
import { posthogClient } from '../../services/analytics/posthog';
import { supabase } from '../../services/supabase/client';

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

export function PostHogIdentityBridge() {
  const authUser = useAppStore((state) => state.authUser);

  useEffect(() => {
    if (!posthogClient) {
      return;
    }

    if (!authUser) {
      posthogClient.reset();
      return;
    }

    posthogClient.identify(authUser.id, {
      email: authUser.email,
      auth_provider: authUser.provider,
    });
  }, [authUser]);

  return null;
}

type RuntimeServicesProps = {
  children: ReactNode;
};

export function RuntimeServices({ children }: RuntimeServicesProps) {
  return (
    <>
      <SupabaseSessionBridge />
      <PostHogIdentityBridge />
      {children}
    </>
  );
}

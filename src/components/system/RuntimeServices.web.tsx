import { ReactNode, useEffect } from 'react';

import { useAppStore } from '../../store/useAppStore';
import { restoreSession } from '../../services/auth';
import { posthogClient } from '../../services/analytics/posthog';

export function SessionBridge() {
  useEffect(() => {
    restoreSession().catch((error) => {
      console.warn('[auth] failed to restore session', error);
    });
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
      <SessionBridge />
      <PostHogIdentityBridge />
      {children}
    </>
  );
}

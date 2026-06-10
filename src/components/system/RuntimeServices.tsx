import * as Notifications from 'expo-notifications';
import { ReactNode, useEffect, useRef } from 'react';

import { useAppStore } from '../../store/useAppStore';
import { restoreSupabaseSession, syncSessionToStore } from '../../services/auth';
import { apiClient } from '../../services/api/client';
import { trackEvent } from '../../services/analytics';
import { supabase } from '../../services/supabase/client';
import { posthogClient } from '../../services/analytics/posthog';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { navigationRef } from '../../navigation/navigationRef';
import { getRevenueCatBillingSyncRequest, resetRevenueCatIdentity } from '../../services/billing/revenueCat';

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

export function RemoteBootstrapBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const syncInitialAccountState = useAppStore((state) => state.syncInitialAccountState);
  const refreshRemoteState = useAppStore((state) => state.refreshRemoteState);

  useEffect(() => {
    if (!authUser || serverSyncInFlight) {
      return;
    }

    if (initialServerSyncNeeded) {
      void syncInitialAccountState().catch((error) => {
        console.warn('[bootstrap] failed to sync initial account state', error);
      });
      return;
    }

    if (!remoteDataLoaded) {
      void refreshRemoteState().catch((error) => {
        console.warn('[bootstrap] failed to hydrate remote state', error);
      });
    }
  }, [authUser, initialServerSyncNeeded, refreshRemoteState, remoteDataLoaded, serverSyncInFlight, syncInitialAccountState]);

  return null;
}

export function RevenueCatBillingBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const billing = useAppStore((state) => state.billing);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const applyBillingState = useAppStore((state) => state.applyBillingState);
  const lastSyncedUserRef = useRef<string | null>(null);
  const hadIdentifiedUserRef = useRef(false);

  useEffect(() => {
    if (!authUser) {
      lastSyncedUserRef.current = null;
      if (hadIdentifiedUserRef.current) {
        hadIdentifiedUserRef.current = false;
        void resetRevenueCatIdentity().catch((error) => {
          console.warn('[revenuecat] failed to reset identity', error);
        });
      }
      return;
    }

    hadIdentifiedUserRef.current = true;
    if (initialServerSyncNeeded || lastSyncedUserRef.current === authUser.id) {
      return;
    }

    lastSyncedUserRef.current = authUser.id;
    getRevenueCatBillingSyncRequest(authUser.id, billing.monthlyAllowance, authUser.email)
      .then(async (request) => {
        if (!request) {
          return;
        }

        const response = await apiClient.syncBilling(request);
        applyBillingState(response.billing);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);
      })
      .catch((error) => {
        lastSyncedUserRef.current = null;
        console.warn('[revenuecat] failed to sync billing state', error);
      });
  }, [applyBillingState, authUser, billing.monthlyAllowance, initialServerSyncNeeded]);

  return null;
}

export function NotificationResponseBridge() {
  useEffect(() => {
    function openDailyReport(localDate?: string) {
      trackEvent('daily_report_push_opened', { local_date: localDate });
      if (navigationRef.isReady()) {
        navigationRef.navigate('DailyGutReport', { localDate });
      }
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data;
      if (data?.type === 'daily_gut_report') {
        openDailyReport(typeof data.localDate === 'string' ? data.localDate : undefined);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'daily_gut_report') {
        openDailyReport(typeof data.localDate === 'string' ? data.localDate : undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
      <RemoteBootstrapBridge />
      <RevenueCatBillingBridge />
      <NotificationResponseBridge />
      {children}
    </>
  );
}

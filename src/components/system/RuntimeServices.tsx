import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ReactNode, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

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
import { remoteConfig } from '../../config/remoteConfig';
import {
  ensureDailyCheckinScheduled,
  ensureNotificationPermission,
  ensureWeeklyReportScheduled,
  registerDailyReportNotifications,
} from '../../services/notifications';
import {
  DAILY_CHECKIN_TYPE,
  WEEKLY_REPORT_TYPE,
  severityForCheckinAction,
} from '../../services/notifications/dailyCheckin';

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

        const previousBilling = useAppStore.getState().billing;
        const response = await apiClient.syncBilling(request);
        applyBillingState(response.billing);
        // Only refetch downstream data when billing actually changed —
        // otherwise every launch pays for a redundant home/history/insights
        // round-trip after the sync.
        const billingChanged =
          previousBilling.subscriptionStatus !== response.billing.subscriptionStatus ||
          previousBilling.tokensRemaining !== response.billing.tokensRemaining ||
          previousBilling.selectedPlan !== response.billing.selectedPlan;
        if (billingChanged) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);
        }
      })
      .catch((error) => {
        lastSyncedUserRef.current = null;
        console.warn('[revenuecat] failed to sync billing state', error);
      });
  }, [applyBillingState, authUser, billing.monthlyAllowance, initialServerSyncNeeded]);

  return null;
}

export function NotificationResponseBridge() {
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    function openDailyReport(localDate?: string) {
      trackEvent('daily_report_push_opened', { local_date: localDate });
      if (navigationRef.isReady()) {
        navigationRef.navigate('DailyGutReport', { localDate });
      }
    }

    // One-tap check-in: the notification action carries the severity; save the
    // report immediately and land on the payoff screen. A body tap (default
    // action) opens the full report form instead.
    function handleCheckinResponse(localDate: string, actionIdentifier: string) {
      const severity = severityForCheckinAction(actionIdentifier);
      if (severity === null) {
        openDailyReport(localDate);
        return;
      }

      trackEvent('daily_checkin_action_tapped', {
        local_date: localDate,
        severity,
      });
      void useAppStore
        .getState()
        .upsertDailyReport({ localDate, gutSeverity: severity })
        .catch((error) => {
          console.warn('[notifications] one-tap report failed', error);
        });
      if (navigationRef.isReady()) {
        navigationRef.navigate('DailyReportPayoff', { localDate });
      }
    }

    function handleResponse(response: Notifications.NotificationResponse) {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponseRef.current === responseKey) {
        return;
      }
      handledResponseRef.current = responseKey;

      const data = response.notification.request.content.data;
      const localDate = typeof data?.localDate === 'string' ? data.localDate : undefined;

      if (data?.type === DAILY_CHECKIN_TYPE && localDate) {
        handleCheckinResponse(localDate, response.actionIdentifier);
        return;
      }

      if (data?.type === WEEKLY_REPORT_TYPE) {
        trackEvent('weekly_report_notification_opened');
        if (navigationRef.isReady()) {
          navigationRef.navigate('WeeklyProgress');
        }
        return;
      }

      if (data?.type === 'daily_gut_report') {
        openDailyReport(localDate);
      }
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

const PERMISSION_PROMPTED_KEY = 'notifications.permissionPrompted';

export function NotificationSchedulerBridge() {
  const onboardingStage = useAppStore((state) => state.onboardingStage);
  const authUser = useAppStore((state) => state.authUser);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const scans = useAppStore((state) => state.scans);
  const registeredPushRef = useRef(false);

  const active = onboardingStage === 'complete' && Boolean(authUser);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    async function syncSchedule() {
      try {
        // First entry after onboarding: surface the iOS permission dialog once
        // (the priming step in onboarding sets this up). Later runs are silent.
        const alreadyPrompted = await AsyncStorage.getItem(PERMISSION_PROMPTED_KEY);
        if (!alreadyPrompted) {
          await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, 'yes');
          const granted = await ensureNotificationPermission();
          trackEvent('notification_permission_resolved', { granted });
        }

        if (cancelled) {
          return;
        }

        await ensureDailyCheckinScheduled({
          reports: dailyReports,
          scans,
        });
        await ensureWeeklyReportScheduled({
          accountCreatedAt: useAppStore.getState().authUser?.createdAt ?? null,
        });

        if (remoteConfig.featureFlags.livePush && !registeredPushRef.current) {
          registeredPushRef.current = true;
          // Token registration is not launch-critical; defer it off the
          // first-paint window so it doesn't contend with home/history fetches.
          setTimeout(() => {
            void registerDailyReportNotifications().catch((error) => {
              console.warn('[notifications] push token registration failed', error);
            });
          }, 8000);
        }
      } catch (error) {
        console.warn('[notifications] daily check-in scheduling failed', error);
      }
    }

    void syncSchedule();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncSchedule();
      }
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
    };
  }, [active, dailyReports, scans]);

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
      <NotificationSchedulerBridge />
      {children}
    </>
  );
}

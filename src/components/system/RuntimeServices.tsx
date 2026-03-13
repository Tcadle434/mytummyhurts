import * as Notifications from 'expo-notifications';
import { useSuperwallEvents, useUser } from 'expo-superwall';
import { ReactNode, useEffect, useRef } from 'react';

import { useAppStore } from '../../store/useAppStore';
import { restoreSupabaseSession, syncSessionToStore } from '../../services/auth';
import { apiClient } from '../../services/api/client';
import { trackEvent } from '../../services/analytics';
import { supabase } from '../../services/supabase/client';
import { buildSubscriptionWindow, derivePlanFromProductId } from '../../services/billing/plans';
import { posthogClient } from '../../services/analytics/posthog';
import { subscribeToMealFollowupNotificationResponses } from '../../services/notifications';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { navigationRef } from '../../navigation/navigationRef';

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

export function SuperwallIdentityBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const { identify, update, signOut } = useUser();

  useEffect(() => {
    if (!authUser) {
      signOut().catch((error) => {
        console.warn('[superwall] failed to sign out user', error);
      });
      return;
    }

    identify(authUser.id)
      .then(() =>
        update({
          email: authUser.email,
          auth_provider: authUser.provider,
        }),
      )
      .catch((error) => {
        console.warn('[superwall] failed to identify user', error);
      });
  }, [authUser, identify, update, signOut]);

  return null;
}

type SuperwallEventPayload = {
  event?: string;
  product?: {
    id?: string;
    productIdentifier?: string;
    fullIdentifier?: string;
  };
  transaction?: {
    transactionDate?: string;
    expirationDate?: string;
    storeTransactionId?: string;
    originalTransactionIdentifier?: string;
  };
};

export function SuperwallBillingBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const billing = useAppStore((state) => state.billing);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const applyBillingState = useAppStore((state) => state.applyBillingState);
  const lastSyncedTransactionRef = useRef<string | null>(null);

  async function syncBillingEvent(params: {
    status: 'trialing' | 'active' | 'expired';
    productId?: string | null;
    transactionDate?: string | null;
    expirationDate?: string | null;
    transactionId?: string | null;
    originalTransactionId?: string | null;
  }) {
    if (!authUser || initialServerSyncNeeded) {
      return;
    }

    const planCode = derivePlanFromProductId(params.productId) ?? billing.selectedPlan;
    const startedAt = params.transactionDate ? new Date(params.transactionDate) : new Date();
    const windows = buildSubscriptionWindow(planCode, startedAt);
    const trialEndsAt = params.status === 'trialing' ? params.expirationDate ?? windows.trialEndsAt : windows.trialEndsAt;
    const renewalAt = params.expirationDate ?? windows.renewalAt;
    const transactionId =
      params.transactionId ??
      params.originalTransactionId ??
      `${params.status}:${params.productId ?? planCode}:${startedAt.toISOString()}`;

    if (lastSyncedTransactionRef.current === transactionId) {
      return;
    }

    lastSyncedTransactionRef.current = transactionId;

    const response = await apiClient.syncBilling({
      planCode,
      status: params.status,
      productId: params.productId ?? undefined,
      transactionId,
      originalTransactionId: params.originalTransactionId ?? undefined,
      currentPeriodStart: params.transactionDate ?? windows.currentPeriodStart,
      trialEndsAt,
      renewalAt,
      monthlyAllowance: billing.monthlyAllowance,
    });

    applyBillingState(response.billing);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
      queryClient.invalidateQueries({ queryKey: queryKeys.history }),
      queryClient.invalidateQueries({ queryKey: queryKeys.home }),
    ]);
  }

  useSuperwallEvents({
    onSubscriptionStatusChange: (status) => {
      if (!authUser || initialServerSyncNeeded) {
        return;
      }

      if (status.status === 'INACTIVE' && billing.subscriptionStatus !== 'none') {
        void syncBillingEvent({
          status: 'expired',
          productId: null,
          transactionDate: null,
          expirationDate: null,
          transactionId: `inactive:${authUser.id}:${Date.now()}`,
          originalTransactionId: null,
        }).catch((error) => {
          console.warn('[superwall] failed to sync inactive subscription state', error);
        });
      }
    },
    onSuperwallEvent: (payload: unknown) => {
      const event = payload as SuperwallEventPayload;
      const eventName = event.event;
      if (!eventName || !authUser || initialServerSyncNeeded) {
        return;
      }

      const productId = event.product?.productIdentifier ?? event.product?.id ?? event.product?.fullIdentifier ?? null;
      const transactionDate = event.transaction?.transactionDate ?? null;
      const expirationDate = event.transaction?.expirationDate ?? null;
      const transactionId = event.transaction?.storeTransactionId ?? null;
      const originalTransactionId = event.transaction?.originalTransactionIdentifier ?? null;

      if (eventName === 'freeTrialStart') {
        void syncBillingEvent({
          status: 'trialing',
          productId,
          transactionDate,
          expirationDate,
          transactionId,
          originalTransactionId,
        }).catch((error) => {
          console.warn('[superwall] failed to sync trial start', error);
        });
      }

      if (eventName === 'subscriptionStart' || eventName === 'transactionComplete' || eventName === 'transactionRestore') {
        void syncBillingEvent({
          status: 'active',
          productId,
          transactionDate,
          expirationDate,
          transactionId,
          originalTransactionId,
        }).catch((error) => {
          console.warn('[superwall] failed to sync purchase state', error);
        });
      }
    },
  });

  return null;
}

export function NotificationResponseBridge() {
  useEffect(() => {
    function openFollowup(mealId: string) {
      trackEvent('followup_push_opened', { meal_id: mealId });
      if (navigationRef.isReady()) {
        navigationRef.navigate('FollowUp', { mealId });
      }
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const mealId = response?.notification.request.content.data?.mealId;
      if (typeof mealId === 'string' && mealId.length > 0) {
        openFollowup(mealId);
      }
    });

    return subscribeToMealFollowupNotificationResponses((mealId) => {
      openFollowup(mealId);
    });
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
      <NotificationResponseBridge />
      {children}
    </>
  );
}

import { useEffect, useRef } from 'react';

import { apiClient } from '../../../services/api/client';
import { getRevenueCatBillingSyncRequest, resetRevenueCatIdentity } from '../../../services/billing/revenueCat';
import { queryClient } from '../../../services/query/client';
import { queryKeys } from '../../../services/query/keys';
import { useAppStore } from '../../../store/useAppStore';

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

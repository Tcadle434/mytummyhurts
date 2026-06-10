import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { AppScreen } from '../../components/common/UI';
import { env } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { apiClient } from '../../services/api/client';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList, OnboardingStackParamList } from '../../navigation/types';
import { isEntitledSubscriptionStatus } from '../../features/access/appAccess';
import { PaywallOfferContent } from './PaywallOfferContent';
import {
  RevenueCatPurchaseCancelledError,
  canUseRevenueCatPurchases,
  loadRevenueCatPlanDisplay,
  purchaseRevenueCatPlan,
  restoreRevenueCatPurchases,
} from '../../services/billing/revenueCat';
import { RevenueCatPlanDisplay, revenueCatSnapshotToBillingSyncRequest } from '../../services/billing/revenueCatMapping';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingPaywall'>;

export function PaywallScreen({ navigation }: Props) {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();
  const billing = useAppStore((state) => state.billing);
  const authUser = useAppStore((state) => state.authUser);
  const selectPlan = useAppStore((state) => state.selectPlan);
  const stageEntitlementAccess = useAppStore((state) => state.stageEntitlementAccess);
  const applyBillingState = useAppStore((state) => state.applyBillingState);
  const refreshRemoteState = useAppStore((state) => state.refreshRemoteState);
  const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyIntent, setBusyIntent] = useState<'subscribe' | 'restore' | null>(null);
  const [planDisplay, setPlanDisplay] = useState<RevenueCatPlanDisplay>({});

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  useEffect(() => {
    if (!canUseRevenueCatPurchases()) {
      return;
    }

    let isMounted = true;
    loadRevenueCatPlanDisplay()
      .then((display) => {
        if (isMounted) {
          setPlanDisplay(display);
        }
      })
      .catch((error) => {
        console.warn('[revenuecat] failed to load offerings', error);
        if (isMounted) {
          setStatusMessage('Subscription plans could not be loaded. You can still retry in a moment.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function openPaywall(intent: 'subscribe' | 'restore') {
    setBusyIntent(intent);
    setStatusMessage(null);

    if (!canUseRevenueCatPurchases()) {
      setBusyIntent(null);
      setStatusMessage('Purchases are not available in this build. Please try again on iPhone.');
      return;
    }

    try {
      trackEvent(intent === 'restore' ? 'restore_purchases_tapped' : 'paywall_continue_tapped', {
        selected_plan: billing.selectedPlan,
      });

      const snapshot = intent === 'restore'
        ? await restoreRevenueCatPurchases()
        : await purchaseRevenueCatPlan(billing.selectedPlan);

      if (!snapshot.entitlementActive) {
        setStatusMessage('No active subscription was found. Choose a plan or restore another Apple account.');
        return;
      }

      if (authUser) {
        const response = await apiClient.syncBilling(
          revenueCatSnapshotToBillingSyncRequest(snapshot, billing.monthlyAllowance),
        );
        applyBillingState(response.billing);

        if (!isEntitledSubscriptionStatus(response.billing.subscriptionStatus)) {
          setOnboardingStage('paywall');
          setStatusMessage('Your subscription could not be verified yet. Please try restoring purchases.');
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);
        await refreshRemoteState().catch((error) => {
          console.warn('[paywall] remote refresh failed after verified purchase', error);
        });
        setOnboardingStage('complete');
        trackEvent(intent === 'restore' ? 'purchase_restored' : 'subscription_started', {
          plan_code: response.billing.selectedPlan,
          product_id: snapshot.productId,
          status: response.billing.subscriptionStatus,
          provider: 'revenuecat',
          signed_in: true,
        });
        return;
      }

      stageEntitlementAccess(snapshot.status);
      trackEvent(intent === 'restore' ? 'purchase_restored' : 'subscription_started', {
        plan_code: snapshot.planCode ?? billing.selectedPlan,
        product_id: snapshot.productId,
        status: snapshot.status,
        provider: 'revenuecat',
      });
      navigation.replace('OnboardingAuth');
    } catch (error) {
      if (error instanceof RevenueCatPurchaseCancelledError) {
        setStatusMessage('No purchase was completed. You can review plans or restore an existing subscription.');
      } else {
        setStatusMessage(error instanceof Error ? error.message : 'The purchase could not be completed.');
      }
    } finally {
      setBusyIntent(null);
    }
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.screenContent}>
      <PaywallOfferContent
        selectedPlan={billing.selectedPlan}
        busy={busyIntent !== null}
        statusMessage={statusMessage}
        planDisplay={planDisplay}
        onSelectPlan={selectPlan}
        onContinue={() => void openPaywall('subscribe')}
        onRestore={() => void openPaywall('restore')}
        onTerms={() => {
          void openLegalSurface(env.termsUrl, () => rootNavigation.navigate('LegalDocument', { document: 'terms' }));
        }}
        onPrivacy={() => {
          void openLegalSurface(env.privacyUrl, () => rootNavigation.navigate('LegalDocument', { document: 'privacy' }));
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing.lg,
  },
});

async function openLegalSurface(url: string, fallback: () => void) {
  if (!url || url.includes('example.com')) {
    fallback();
    return;
  }

  try {
    await Linking.openURL(url);
  } catch {
    fallback();
  }
}

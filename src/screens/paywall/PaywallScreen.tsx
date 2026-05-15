import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { usePlacement } from 'expo-superwall';

import { AppScreen } from '../../components/common/UI';
import { env, isSuperwallConfigured } from '../../config/env';
import { onboardingSteps } from '../../data/onboarding';
import { remoteConfig } from '../../config/remoteConfig';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList, OnboardingStackParamList } from '../../navigation/types';
import { PaywallOfferContent } from './PaywallOfferContent';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingPaywall'>;

export function PaywallScreen({ navigation }: Props) {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();
  const billing = useAppStore((state) => state.billing);
  const selectPlan = useAppStore((state) => state.selectPlan);
  const completePurchase = useAppStore((state) => state.completePurchase);
  const stageEntitlementAccess = useAppStore((state) => state.stageEntitlementAccess);
  const setOnboardingStepIndex = useAppStore((state) => state.setOnboardingStepIndex);
  const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyIntent, setBusyIntent] = useState<'subscribe' | 'restore' | null>(null);
  const { registerPlacement, state } = usePlacement({
    onPresent: () => {
      trackEvent('paywall_presented', {
        placement: remoteConfig.paywallPlacement,
        selected_plan: billing.selectedPlan,
      });
    },
    onDismiss: (_paywallInfo, result) => {
      setBusyIntent(null);
      if (result.type === 'purchased') {
        completePurchase();
        navigation.replace('OnboardingAuth');
        return;
      }

      if (result.type === 'restored') {
        stageEntitlementAccess('active');
        navigation.replace('OnboardingAuth');
        return;
      }

      setStatusMessage('No purchase was completed. You can review plans or restore an existing subscription.');
    },
    onSkip: (reason) => {
      setBusyIntent(null);
      if (reason.type === 'PlacementNotFound') {
        setStatusMessage('The paywall placement is not available yet. Check Superwall campaign setup.');
        return;
      }

      stageEntitlementAccess('active');
      navigation.replace('OnboardingAuth');
    },
    onError: (error) => {
      setBusyIntent(null);
      setStatusMessage(error);
    },
  });

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  useEffect(() => {
    if (state.status === 'presented') {
      setStatusMessage(null);
    }
  }, [state.status]);

  async function openPaywall(intent: 'subscribe' | 'restore') {
    setBusyIntent(intent);
    setStatusMessage(null);

    if (!isSuperwallConfigured) {
      if (intent === 'restore') {
        stageEntitlementAccess('active');
      } else {
        completePurchase();
      }
      navigation.replace('OnboardingAuth');
      return;
    }

    try {
      trackEvent(intent === 'restore' ? 'restore_purchases_tapped' : 'paywall_continue_tapped', {
        selected_plan: billing.selectedPlan,
      });
      await registerPlacement({
        placement: remoteConfig.paywallPlacement,
        params: {
          selected_plan: billing.selectedPlan,
          intent,
          source: 'onboarding',
        },
        feature: () => {
          stageEntitlementAccess('active');
          navigation.replace('OnboardingAuth');
        },
      });
    } catch (error) {
      setBusyIntent(null);
      setStatusMessage(error instanceof Error ? error.message : 'The paywall could not be opened.');
    }
  }

  function returnToOnboarding() {
    setOnboardingStepIndex(onboardingSteps.length - 1);
    setOnboardingStage('flow');
    navigation.replace('OnboardingFlow');
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.screenContent}>
      <PaywallOfferContent
        selectedPlan={billing.selectedPlan}
        busy={busyIntent !== null}
        statusMessage={statusMessage}
        onSelectPlan={selectPlan}
        onContinue={() => void openPaywall('subscribe')}
        onRestore={() => void openPaywall('restore')}
        onTerms={() => {
          void openLegalSurface(env.termsUrl, () => rootNavigation.navigate('LegalDocument', { document: 'terms' }));
        }}
        onPrivacy={() => {
          void openLegalSurface(env.privacyUrl, () => rootNavigation.navigate('LegalDocument', { document: 'privacy' }));
        }}
        onBack={returnToOnboarding}
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

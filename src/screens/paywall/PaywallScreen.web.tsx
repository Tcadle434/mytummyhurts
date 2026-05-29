import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { AppScreen } from '../../components/common/UI';
import { env } from '../../config/env';
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
  const [busyIntent, setBusyIntent] = useState<'subscribe' | 'restore' | null>(null);

  useEffect(() => {
    trackEvent('paywall_viewed', { surface: 'web_preview' });
  }, []);

  async function openPaywall(intent: 'subscribe' | 'restore') {
    setBusyIntent(intent);

    if (intent === 'restore') {
      stageEntitlementAccess('active');
    } else {
      completePurchase();
    }

    navigation.replace('OnboardingAuth');
    setBusyIntent(null);
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.screenContent}>
      <PaywallOfferContent
        selectedPlan={billing.selectedPlan}
        busy={busyIntent !== null}
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

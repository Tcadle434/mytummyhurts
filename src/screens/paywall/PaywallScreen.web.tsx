import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { AppScreen } from '../../components/common/UI';
import { env } from '../../config/env';
import { normalizeOnboardingAnswers } from '../../data/onboarding';
import { trackEvent } from '../../services/analytics';
import { computeGutScoreState } from '../../services/ai/scoring';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { deriveStartingSuspects, hasCaseFileSignal } from '../../features/paywall/startingSuspects';
import { PaywallOfferContent, type PaywallCaseFile } from './PaywallOfferContent';

export function PaywallScreen() {
  const rootNavigation = useNavigation<NavigationProp<RootStackParamList>>();
  const billing = useAppStore((state) => state.billing);
  const selectPlan = useAppStore((state) => state.selectPlan);
  const persistedAnswers = useAppStore((state) => state.onboardingAnswers);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [busyIntent, setBusyIntent] = useState<'subscribe' | 'restore' | null>(null);

  // Same personalized case file the native paywall shows — the web preview
  // must render the real hero, not the signed-out fallback.
  const caseFile = useMemo<PaywallCaseFile | null>(() => {
    const answers = normalizeOnboardingAnswers(persistedAnswers);
    if (!hasCaseFileSignal(answers)) {
      return null;
    }

    const startingGutScore = computeGutScoreState({
      answers,
      insights: [],
      scans: [],
      dailyReports: [],
    });

    return {
      startingScore: startingGutScore.currentScore,
      suspects: deriveStartingSuspects(answers, 3),
      conditionCount: answers.conditions.length + answers.customConditions.length,
    };
  }, [persistedAnswers]);

  useEffect(() => {
    trackEvent('paywall_viewed', { surface: 'web_preview' });
  }, []);

  async function openPaywall(intent: 'subscribe' | 'restore') {
    setBusyIntent(intent);
    trackEvent(intent === 'restore' ? 'restore_purchases_tapped' : 'paywall_continue_tapped', {
      selected_plan: billing.selectedPlan,
      surface: 'web_preview',
    });
    setStatusMessage('Purchases are available in the iPhone app. Open MyTummyHurts on iPhone to subscribe or restore.');
    setBusyIntent(null);
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.screenContent}>
      <PaywallOfferContent
        selectedPlan={billing.selectedPlan}
        busy={busyIntent !== null}
        statusMessage={statusMessage}
        caseFile={caseFile}
        onSelectPlan={selectPlan}
        onContinue={() => void openPaywall('subscribe')}
        onRestore={() => void openPaywall('restore')}
        onTerms={() => {
          void openLegalSurface(env.termsUrl, () => rootNavigation.navigate('LegalDocument', { document: 'terms' }));
        }}
        onPrivacy={() => {
          void openLegalSurface(env.privacyUrl, () => rootNavigation.navigate('LegalDocument', { document: 'privacy' }));
        }}
        onScience={() => rootNavigation.navigate('LegalDocument', { document: 'science' })}
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

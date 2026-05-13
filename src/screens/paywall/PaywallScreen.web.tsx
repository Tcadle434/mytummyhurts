import { NavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { AppScreen, DetailRow, InfoPill, PrimaryButton, ScreenHeader, SectionCard } from '../../components/common/UI';
import { env } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';
import { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingPaywall'>;

const planCopy = {
  monthly: {
    title: 'Monthly',
    price: '$6.99/mo',
    badge: 'Flexible',
  },
  annual: {
    title: 'Annual',
    price: '$34.99/yr',
    badge: 'Best value',
  },
} as const;

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
    <AppScreen>
      <ScreenHeader
        eyebrow="Subscription"
        title="Stop guessing what food will do to your stomach."
        subtitle="Your subscription includes a monthly scan allowance, full history, and adaptive trigger insights."
      />

      <SectionCard>
        <InfoPill label="Web preview uses a simplified paywall flow. Native purchase handling stays in the iOS app." tone="soft" />
      </SectionCard>

      <SectionCard>
        <Text style={styles.planHeader}>Choose your plan</Text>
        <View style={styles.planRow}>
          {(['monthly', 'annual'] as const).map((plan) => {
            const selected = billing.selectedPlan === plan;
            const copy = planCopy[plan];
            return (
              <SectionCard key={plan} style={[styles.planCard, selected && styles.planCardSelected]}>
                <Text style={styles.planTitle}>{copy.title}</Text>
                <Text style={styles.planPrice}>{copy.price}</Text>
                <InfoPill label={copy.badge} tone={selected ? 'soft' : 'default'} />
                <PrimaryButton label={selected ? 'Selected' : 'Choose'} onPress={() => selectPlan(plan)} />
              </SectionCard>
            );
          })}
        </View>
      </SectionCard>

      <SectionCard>
        <InfoPill label="1-week free trial" tone="soft" />
        <DetailRow label="Included scans each month" value={`${billing.monthlyAllowance}`} />
        <DetailRow label="History and daily reports" value="Unlimited" />
        <DetailRow label="Trigger and safe-food insights" value="Included" />
        <DetailRow label="Restore purchases" value="Available in the iOS app" />
      </SectionCard>

      <PrimaryButton
        label={busyIntent === 'subscribe' ? 'Continuing…' : 'Continue'}
        onPress={() => void openPaywall('subscribe')}
        disabled={busyIntent !== null}
      />
      <PrimaryButton
        label={busyIntent === 'restore' ? 'Restoring…' : 'Restore preview access'}
        onPress={() => void openPaywall('restore')}
        disabled={busyIntent !== null}
      />
      <View style={styles.legalRow}>
        <Text
          style={styles.legalLink}
          onPress={() => {
            void openLegalSurface(env.termsUrl, () => rootNavigation.navigate('LegalDocument', { document: 'terms' }));
          }}
        >
          Terms
        </Text>
        <Text style={styles.legalDot}>·</Text>
        <Text
          style={styles.legalLink}
          onPress={() => {
            void openLegalSurface(env.privacyUrl, () => rootNavigation.navigate('LegalDocument', { document: 'privacy' }));
          }}
        >
          Privacy
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  planHeader: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  planRow: {
    gap: spacing.md,
  },
  planCard: {
    gap: spacing.sm,
  },
  planCardSelected: {
    borderColor: palette.primary,
  },
  planTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
    textTransform: 'capitalize',
  },
  planPrice: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
  legalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  legalLink: {
    color: palette.primaryDark,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  legalDot: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
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

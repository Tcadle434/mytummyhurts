import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Gauge } from '../../components/charts/Gauge';
import { RiskBar } from '../../components/charts/RiskBar';
import {
  AppScreen,
  DetailRow,
  Divider,
  InfoPill,
  InputField,
  MetricPill,
  OptionChip,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { onboardingSteps } from '../../data/onboarding';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { OnboardingStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingFlow'>;

export function OnboardingFlowScreen({ navigation }: Props) {
  const stepIndex = useAppStore((state) => state.onboardingStepIndex);
  const answers = useAppStore((state) => state.onboardingAnswers);
  const setStepIndex = useAppStore((state) => state.setOnboardingStepIndex);
  const updateField = useAppStore((state) => state.updateOnboardingField);
  const toggleValue = useAppStore((state) => state.toggleOnboardingValue);
  const addCustomValue = useAppStore((state) => state.addCustomOnboardingValue);
  const [customEntry, setCustomEntry] = useState('');

  const step = onboardingSteps[Math.min(stepIndex, onboardingSteps.length - 1)]!;
  const stepCount = onboardingSteps.length;

  useEffect(() => {
    trackEvent('onboarding_step_viewed', { step_id: step.id, step_number: step.step });
  }, [step.id, step.step]);

  const progress = ((stepIndex + 1) / stepCount) * 100;

  function handleContinue() {
    trackEvent('onboarding_step_completed', { step_id: step.id, step_number: step.step });

    if (stepIndex >= onboardingSteps.length - 1) {
      navigation.replace('OnboardingPaywall');
      return;
    }

    setStepIndex(stepIndex + 1);
  }

  function handleBack() {
    if (stepIndex <= 0) {
      return;
    }
    setStepIndex(stepIndex - 1);
  }

  function renderPreview() {
    switch (step.previewVariant) {
      case 'howItWorks':
        return (
          <View style={styles.previewStack}>
            {['Take a photo', 'Get your risk score', 'Learn your triggers'].map((entry, index) => (
              <SectionCard key={entry} style={styles.previewCard}>
                <InfoPill label={`Step ${index + 1}`} tone="soft" />
                <Text style={styles.previewTitle}>{entry}</Text>
              </SectionCard>
            ))}
          </View>
        );
      case 'resultPreview':
        return (
          <SectionCard>
            <Gauge score={72} label="high" />
            <Text style={styles.previewBody}>This meal may trigger symptoms for you.</Text>
            <RiskBar label="GERD" score={81} level="high" />
            <RiskBar label="IBS" score={56} level="medium" />
            <DetailRow label="Possible triggers" value="Tomato, garlic" />
          </SectionCard>
        );
      case 'triggerPreview':
        return (
          <View style={styles.previewStack}>
            {[
              { name: 'Tomato', value: 'Strong pattern' },
              { name: 'Garlic', value: 'Growing pattern' },
              { name: 'Dairy', value: 'Early watch-out' },
            ].map((entry) => (
              <SectionCard key={entry.name} style={styles.previewCard}>
                <Text style={styles.previewTitle}>{entry.name}</Text>
                <Text style={styles.previewNote}>{entry.value}</Text>
              </SectionCard>
            ))}
          </View>
        );
      case 'safeFoodsPreview':
        return (
          <View style={styles.previewStack}>
            {['Rice', 'Salmon', 'Oats'].map((entry) => (
              <SectionCard key={entry} style={styles.previewCard}>
                <Text style={styles.previewTitle}>{entry}</Text>
                <Text style={styles.previewNote}>Trending gentler for your stomach</Text>
              </SectionCard>
            ))}
          </View>
        );
      case 'trust':
        return (
          <SectionCard>
            <DetailRow label="Uses" value="Meal analysis + your profile + learned patterns" />
            <DetailRow label="Avoids" value="Diagnosis language or guaranteed safety claims" />
            <Text style={styles.previewNote}>Hidden ingredients and preparation still matter.</Text>
          </SectionCard>
        );
      case 'summaryIntro':
        return (
          <SectionCard>
            <MetricPill label="Conditions" value={String(answers.conditions.length + answers.customConditions.length || 0)} />
            <MetricPill
              label="Known triggers"
              value={String(answers.ingredientSensitivities.length + answers.customIngredientSensitivities.length || 0)}
            />
          </SectionCard>
        );
      case 'recap':
        return (
          <View style={styles.metricRow}>
            <MetricPill label="Risk scores" value="0-100" />
            <MetricPill label="History" value="Scan-led" />
            <MetricPill label="Insights" value="Adaptive" />
          </View>
        );
      default:
        return null;
    }
  }

  function renderSummary() {
    const conditionSummary =
      answers.conditions.length + answers.customConditions.length > 0
        ? [...answers.conditions, ...answers.customConditions].join(', ')
        : 'General digestive triggers until your scans teach us more.';

    const triggerSummary =
      answers.ingredientSensitivities.length + answers.customIngredientSensitivities.length > 0
        ? [...answers.ingredientSensitivities, ...answers.customIngredientSensitivities].join(', ')
        : 'No declared ingredient triggers yet. The app will learn from follow-ups.';

    return (
      <SectionCard>
        <DetailRow label="Conditions we will score for" value={conditionSummary} />
        <Divider />
        <DetailRow label="Known trigger ingredients" value={triggerSummary} />
        <Divider />
        <DetailRow
          label="What we will watch after meals"
          value={answers.symptoms.length ? answers.symptoms.join(', ') : 'Bloating, pain, reflux, and general symptom patterns'}
        />
        <Divider />
        <DetailRow
          label="Where you most need clarity"
          value={answers.mealContexts.length ? answers.mealContexts.join(', ') : 'Restaurants, takeout, and uncertain ingredient mixes'}
        />
      </SectionCard>
    );
  }

  function renderSelectionControls() {
    if (step.type === 'multi_select' && step.field && step.options) {
      const values = answers[step.field];

      return (
        <View style={styles.optionGrid}>
          {step.options.map((option) => (
            <OptionChip
              key={option}
              label={option}
              selected={Array.isArray(values) ? values.includes(option) : false}
              onPress={() => toggleValue(step.field as 'conditions' | 'ingredientSensitivities' | 'symptoms' | 'mealContexts', option)}
            />
          ))}

          {step.allowCustom ? (
            <>
              <InputField value={customEntry} placeholder="Add your own" onChangeText={setCustomEntry} />
              <SecondaryButton
                label="Add custom"
                onPress={() => {
                  const field = step.field === 'conditions' ? 'customConditions' : 'customIngredientSensitivities';
                  addCustomValue(field, customEntry);
                  setCustomEntry('');
                }}
              />
            </>
          ) : null}
        </View>
      );
    }

    if (step.type === 'single_select' && step.field && step.options) {
      const value = answers[step.field];
      return (
        <View style={styles.optionGrid}>
          {step.options.map((option) => (
            <OptionChip
              key={option}
              label={option}
              selected={value === option}
              onPress={() => updateField(step.field as 'symptomFrequency' | 'symptomSeverityBaseline' | 'motivation', option)}
            />
          ))}
        </View>
      );
    }

    if (step.type === 'summary') {
      return renderSummary();
    }

    if (step.type === 'preview') {
      return renderPreview();
    }

    return null;
  }

  return (
    <AppScreen>
      <View style={styles.topBar}>
        <Pressable onPress={handleBack} disabled={stepIndex === 0}>
          <Text style={[styles.backLabel, stepIndex === 0 && { opacity: 0.3 }]}>Back</Text>
        </Pressable>
        <Text style={styles.progressLabel}>
          {step.step} / {stepCount}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScreenHeader eyebrow="Onboarding" title={step.headline} subtitle={step.body} />

      {step.helper ? <InfoPill label={step.helper} tone="soft" /> : null}

      {renderSelectionControls()}

      <View style={styles.footer}>
        <PrimaryButton label={step.cta} onPress={handleContinue} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 15,
  },
  progressLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  progressTrack: {
    height: 10,
    borderRadius: 99,
    backgroundColor: '#E8E3D7',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: palette.primary,
  },
  optionGrid: {
    gap: spacing.sm,
  },
  previewStack: {
    gap: spacing.md,
  },
  previewCard: {
    gap: spacing.sm,
  },
  previewTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 17,
  },
  previewBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  previewNote: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  footer: {
    marginTop: 'auto',
  },
});

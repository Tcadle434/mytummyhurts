import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  AppScreen,
  InputField,
  OptionChip,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { symptomOptions } from '../../data/catalog';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FollowUp'>;

const severityOptions = [
  { id: 'felt_good', label: 'Felt good' },
  { id: 'mild', label: 'Mild symptoms' },
  { id: 'moderate', label: 'Moderate symptoms' },
  { id: 'severe', label: 'Severe symptoms' },
] as const;

export function FollowUpScreen({ navigation, route }: Props) {
  const meals = useAppStore((state) => state.meals);
  const setFollowupState = useAppStore((state) => state.setFollowupState);
  const submitSymptoms = useAppStore((state) => state.submitSymptoms);

  const meal = meals.find((entry) => entry.id === route.params.mealId);
  const [didEat, setDidEat] = useState<boolean | undefined>(meal?.didUserEat);
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]['id'] | undefined>();
  const [symptomTags, setSymptomTags] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!meal) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Missing meal" title="We couldn't find that follow-up." subtitle="Try again from history." />
      </AppScreen>
    );
  }

  if (didEat === false) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Saved" title="Got it — marked as not eaten." subtitle="We'll keep it in your history without using it for learning." />
        <PrimaryButton label="Back to app" onPress={() => navigation.goBack()} />
      </AppScreen>
    );
  }

  const canSave = Boolean(severity);

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Follow-up"
        title={`How did ${meal.title} treat you?`}
        subtitle="Close the loop on the scan so future scores get sharper."
      />

      {didEat === undefined ? (
        <SectionCard>
          <PrimaryButton
            label="Yes, I ate it"
            disabled={busy}
            onPress={() => {
              setDidEat(true);
              setBusy(true);
              void setFollowupState(meal.id, true).finally(() => setBusy(false));
            }}
          />
          <SecondaryButton
            label="No, I didn't"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void setFollowupState(meal.id, false)
                .then(() => {
                  setDidEat(false);
                })
                .finally(() => setBusy(false));
            }}
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <Text>How did you feel after this meal?</Text>
            <View style={{ gap: spacing.sm }}>
              {severityOptions.map((option) => (
                <OptionChip
                  key={option.id}
                  label={option.label}
                  selected={severity === option.id}
                  onPress={() => setSeverity(option.id)}
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard>
            <Text>Which symptoms showed up?</Text>
            <View style={{ gap: spacing.sm }}>
              {symptomOptions.map((tag) => (
                <OptionChip
                  key={tag}
                  label={tag}
                  selected={symptomTags.includes(tag)}
                  onPress={() =>
                    setSymptomTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]))
                  }
                />
              ))}
            </View>
            <InputField value={otherText} placeholder="Anything else worth noting?" onChangeText={setOtherText} multiline />
          </SectionCard>

          <PrimaryButton
            label={busy ? 'Saving…' : 'Save'}
            disabled={!canSave || busy}
            onPress={() => {
              if (!severity) {
                return;
              }
              setBusy(true);
              void submitSymptoms({
                mealId: meal.id,
                severity,
                symptomTags,
                otherText,
              })
                .then(() => {
                  navigation.goBack();
                })
                .finally(() => setBusy(false));
            }}
          />
        </>
      )}
    </AppScreen>
  );
}

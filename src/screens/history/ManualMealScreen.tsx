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
} from '../../components/common/UI';
import { symptomOptions } from '../../data/catalog';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualMeal'>;

const timeOptions = [
  { id: 'just_now', label: 'Just now' },
  { id: 'one_to_two_hours', label: '1-2 hours ago' },
  { id: 'earlier_today', label: 'Earlier today' },
  { id: 'yesterday', label: 'Yesterday' },
] as const;

const severityOptions = [
  { id: 'felt_good', label: 'Felt good' },
  { id: 'mild', label: 'Mild symptoms' },
  { id: 'moderate', label: 'Moderate symptoms' },
  { id: 'severe', label: 'Severe symptoms' },
] as const;

export function ManualMealScreen({ navigation, route }: Props) {
  const scans = useAppStore((state) => state.scans);
  const meals = useAppStore((state) => state.meals);
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const setFollowupState = useAppStore((state) => state.setFollowupState);
  const submitSymptoms = useAppStore((state) => state.submitSymptoms);

  const scan = route.params.scanId ? scans.find((entry) => entry.id === route.params.scanId) : undefined;
  const existingMeal = route.params.scanId ? meals.find((entry) => entry.scanId === route.params.scanId) : undefined;

  const [description, setDescription] = useState('');
  const [eatenTimeBucket, setEatenTimeBucket] = useState<(typeof timeOptions)[number]['id']>('just_now');
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]['id']>('moderate');
  const [symptomTags, setSymptomTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    let mealId = existingMeal?.id;

    try {
      if (!mealId) {
        trackEvent('manual_meal_text');
        const result = await analyzeScanInput({
          sourceType: 'manual_text',
          text: description,
        });
        mealId = result.mealId;
        trackEvent('manual_meal_saved', { entry_mode: 'text', had_image: false, had_text: true });
      } else {
        trackEvent(route.params.scanId ? 'manual_meal_photo' : 'manual_meal_upload');
        trackEvent('manual_meal_saved', { entry_mode: 'photo', had_image: true, had_text: false });
      }

      if (!mealId) {
        return;
      }

      await setFollowupState(mealId, true);
      await submitSymptoms({
        mealId,
        severity,
        symptomTags,
        eatenTimeBucket,
      });

      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'History' } }] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Manual meal"
        title={scan ? `Finish saving ${scan.dishName}` : 'Describe a meal'}
        subtitle="Use this when the meal already happened and you still want the app to learn from it."
      />

      {!scan ? (
        <SectionCard>
          <Text>Describe the meal</Text>
          <InputField
            value={description}
            placeholder="Example: spicy chicken burrito with cheese, salsa, and sour cream"
            onChangeText={setDescription}
            multiline
          />
        </SectionCard>
      ) : null}

      <SectionCard>
        <Text>When did you eat this?</Text>
        <View style={{ gap: spacing.sm }}>
          {timeOptions.map((option) => (
            <OptionChip
              key={option.id}
              label={option.label}
              selected={eatenTimeBucket === option.id}
              onPress={() => setEatenTimeBucket(option.id)}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <Text>How did you feel after it?</Text>
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
      </SectionCard>

      <PrimaryButton label={busy ? 'Saving…' : 'Save meal'} onPress={() => void handleSave()} disabled={busy} />
    </AppScreen>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, InputField, OptionChip, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';
import { createScanRequestId } from '../../utils/id';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualMeal'>;

const contextOptions = ['At home', 'Restaurant', 'Work', 'Late night', 'Stressful', 'Travel'];

export function ManualMealScreen({ navigation }: Props) {
  const analyzeScanInput = useAppStore((state) => state.analyzeScanInput);
  const [mealName, setMealName] = useState('');
  const [ingredientDraft, setIngredientDraft] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const canSave = Boolean(mealName.trim() || ingredients.length || notes.trim()) && !busy;

  function toggleContext(value: string) {
    setSelectedContexts((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  }

  function addIngredient() {
    const trimmed = ingredientDraft.trim().toLowerCase();
    if (!trimmed || ingredients.includes(trimmed)) {
      return;
    }

    setIngredients((current) => [...current, trimmed]);
    setIngredientDraft('');
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setBusy(true);
    try {
      trackEvent('manual_meal_text');
      const requestId = createScanRequestId();
      const result = await analyzeScanInput({
        requestId,
        sourceType: 'manual_text',
        scanCategory: 'food',
        text: buildManualMealDescription({
          mealName,
          ingredients,
          contexts: selectedContexts,
          notes,
        }),
      });
      trackEvent('manual_meal_saved', { request_id: requestId, entry_mode: 'text', had_image: false, had_text: true });
      navigation.replace('ScanResult', { scanId: result.scanId, manualMode: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader title="Describe a meal" subtitle="This is saved as food you ate today and used as learning evidence." />

      <SectionCard>
        <Text style={styles.fieldLabel}>Meal name</Text>
        <InputField value={mealName} placeholder="Turkey sandwich" onChangeText={setMealName} />

        <Text style={styles.fieldLabel}>Ingredients</Text>
        <View style={styles.ingredientWrap}>
          {ingredients.map((ingredient) => (
            <Pressable
              key={ingredient}
              onPress={() => setIngredients((current) => current.filter((entry) => entry !== ingredient))}
              style={({ pressed }) => [styles.ingredientChip, pressed && { opacity: 0.82 }]}
            >
              <Text style={styles.ingredientChipLabel}>{ingredient}</Text>
              <Text style={styles.ingredientChipClose}>x</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.addIngredientRow}>
          <View style={styles.addIngredientField}>
            <InputField value={ingredientDraft} placeholder="+ Add ingredient" onChangeText={setIngredientDraft} />
          </View>
          <Pressable onPress={addIngredient} style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.82 }]}>
            <Ionicons name="add" size={18} color={palette.text} />
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.fieldLabel}>Context</Text>
        <View style={styles.optionWrap}>
          {contextOptions.map((option) => (
            <OptionChip key={option} label={option} selected={selectedContexts.includes(option)} onPress={() => toggleContext(option)} />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Notes</Text>
        <InputField value={notes} placeholder="Sauces, drinks, portion size, or anything you remember..." onChangeText={setNotes} multiline />
      </SectionCard>

      <View style={styles.actionRow}>
        <SecondaryButton label="Cancel" onPress={() => navigation.goBack()} />
        <PrimaryButton label={busy ? 'Saving...' : 'Save food'} onPress={() => void handleSave()} disabled={!canSave} />
      </View>
    </AppScreen>
  );
}

function buildManualMealDescription({
  mealName,
  ingredients,
  contexts,
  notes,
}: {
  mealName: string;
  ingredients: string[];
  contexts: string[];
  notes: string;
}) {
  const parts = [
    mealName.trim() ? `Meal: ${mealName.trim()}.` : '',
    ingredients.length ? `Ingredients: ${ingredients.join(', ')}.` : '',
    contexts.length ? `Context: ${contexts.join(', ')}.` : '',
    notes.trim() ? `Notes: ${notes.trim()}.` : '',
  ].filter(Boolean);

  return parts.join(' ');
}

const styles = StyleSheet.create({
  fieldLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  ingredientWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  ingredientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.status.success.background,
  },
  ingredientChipLabel: {
    color: palette.primaryDark,
    fontFamily: type.body.medium,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  ingredientChipClose: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 18,
    lineHeight: 18,
  },
  addIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addIngredientField: {
    flex: 1,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: components.button.secondary.borderColor,
    backgroundColor: components.button.secondary.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});

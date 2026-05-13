import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, InputField, OptionChip, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { symptomOptions } from '../../data/catalog';
import { RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyGutReport'>;

export function DailyGutReportScreen({ navigation, route }: Props) {
  const targetDate = route.params?.localDate ?? yesterdayLocalDate();
  const existingReport = useAppStore((state) => state.dailyReports.find((report) => report.localDate === targetDate));
  const upsertDailyReport = useAppStore((state) => state.upsertDailyReport);
  const [gutSeverity, setGutSeverity] = useState(existingReport?.gutSeverity ?? 5);
  const [symptomTags, setSymptomTags] = useState<string[]>(existingReport?.symptomTags ?? []);
  const [notes, setNotes] = useState(existingReport?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const dateLabel = useMemo(() => formatLocalDate(targetDate), [targetDate]);

  function toggleSymptom(tag: string) {
    setSymptomTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await upsertDailyReport({
        localDate: targetDate,
        gutSeverity,
        symptomTags,
        notes: notes.trim() || undefined,
      });
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow={dateLabel}
        title="How did your gut feel?"
        subtitle="Log the day overall. You can add symptoms now or skip them."
      />

      <SectionCard style={styles.scaleCard}>
        <View style={styles.scaleHeader}>
          <Text style={styles.fieldLabel}>Gut severity</Text>
          <Text style={[styles.severityValue, { color: severityTone(gutSeverity) }]}>{gutSeverity}/10</Text>
        </View>
        <View style={styles.scaleGrid}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
            const selected = value === gutSeverity;
            return (
              <Pressable
                key={value}
                onPress={() => setGutSeverity(value)}
                style={({ pressed }) => [
                  styles.scaleButton,
                  selected && { backgroundColor: severityTone(value), borderColor: severityTone(value) },
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Text style={[styles.scaleButtonLabel, selected && styles.scaleButtonLabelSelected]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.scaleLegend}>
          <Text style={styles.legendLabel}>Calm</Text>
          <Text style={styles.legendLabel}>More reactive</Text>
        </View>
      </SectionCard>

      <SectionCard>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Symptoms</Text>
          <Text style={styles.optionalLabel}>Optional</Text>
        </View>
        <View style={styles.optionWrap}>
          {symptomOptions.map((tag) => (
            <OptionChip key={tag} label={tag} selected={symptomTags.includes(tag)} onPress={() => toggleSymptom(tag)} />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Notes</Text>
          <Text style={styles.optionalLabel}>Optional</Text>
        </View>
        <InputField value={notes} placeholder="Anything else from that day?" onChangeText={setNotes} multiline />
      </SectionCard>

      <View style={styles.actionRow}>
        <SecondaryButton label="Cancel" onPress={() => navigation.goBack()} />
        <PrimaryButton label={busy ? 'Saving...' : 'Save report'} onPress={() => void handleSave()} disabled={busy} />
      </View>
    </AppScreen>
  );
}

function yesterdayLocalDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toLocalDate(date);
}

function toLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year ?? new Date().getFullYear(), (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function severityTone(value: number) {
  if (value <= 3) return palette.low;
  if (value <= 6) return palette.medium;
  return palette.high;
}

const styles = StyleSheet.create({
  scaleCard: {
    gap: spacing.md,
  },
  scaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  severityValue: {
    fontFamily: type.body.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  scaleGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  scaleButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: components.card.default.borderColor,
    backgroundColor: tokens.color.surface.card.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleButtonLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 14,
  },
  scaleButtonLabelSelected: {
    color: palette.white,
  },
  scaleLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionalLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
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

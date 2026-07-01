import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Pip } from '../../components/common/Pip';
import { SeveritySlider } from '../../components/common/SeveritySlider';
import {
  AppScreen,
  DetailScreenHeader,
  HeroMetric,
  InputField,
  OptionChip,
  PrimaryButton,
  SectionCard,
} from '../../components/common/UI';
import { symptomOptions } from '../../data/catalog';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type, type PipState } from '../../theme';
import { yesterdayLocalDate } from '../../utils/weeklyProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyGutReport'>;

const NO_SYMPTOMS_TAG = 'None';

export function DailyGutReportScreen({ navigation, route }: Props) {
  const targetDate = normalizeLocalDate(route.params?.localDate) ?? yesterdayLocalDate();
  const existingReport = useAppStore((state) => state.dailyReports.find((report) => report.localDate === targetDate));
  const upsertDailyReport = useAppStore((state) => state.upsertDailyReport);
  const existingCustomSymptoms = useMemo(
    () => (existingReport?.symptomTags ?? []).filter((tag) => tag !== NO_SYMPTOMS_TAG && !symptomOptions.includes(tag)),
    [existingReport?.symptomTags],
  );
  const [gutSeverity, setGutSeverity] = useState(existingReport?.gutSeverity ?? 5);
  const [symptomTags, setSymptomTags] = useState<string[]>(
    existingReport?.gutSeverity === 0 ? [NO_SYMPTOMS_TAG] : existingReport?.symptomTags?.filter((tag) => tag !== NO_SYMPTOMS_TAG) ?? [],
  );
  const [customSymptomTags, setCustomSymptomTags] = useState<string[]>(existingCustomSymptoms);
  const [customEntry, setCustomEntry] = useState('');
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [notes, setNotes] = useState(existingReport?.notes ?? '');
  const [evidenceQuality, setEvidenceQuality] = useState<'typical' | 'unscanned'>(
    existingReport?.evidenceQuality ?? 'typical',
  );
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const hydratedReportKey = useRef<string | null>(null);

  const dateLabel = useMemo(() => formatLocalDate(targetDate), [targetDate]);
  const canSave = (gutSeverity === 0 || symptomTags.filter((tag) => tag !== NO_SYMPTOMS_TAG).length > 0) && !busy;
  const bandColor = severityBandColor(gutSeverity);

  useEffect(() => {
    if (!existingReport) {
      return;
    }

    const reportKey = `${existingReport.id}:${existingReport.updatedAt}`;
    if (hydratedReportKey.current === reportKey) {
      return;
    }

    hydratedReportKey.current = reportKey;
    setGutSeverity(existingReport.gutSeverity);
    setSymptomTags(
      existingReport.gutSeverity === 0
        ? [NO_SYMPTOMS_TAG]
        : existingReport.symptomTags.filter((tag) => tag !== NO_SYMPTOMS_TAG),
    );
    setCustomSymptomTags(existingCustomSymptoms);
    setNotes(existingReport.notes ?? '');
    setEvidenceQuality(existingReport.evidenceQuality ?? 'typical');
    setSaveError(null);
  }, [existingCustomSymptoms, existingReport]);

  function handleSeverityChange(value: number) {
    setSaveError(null);
    setGutSeverity(value);
    if (value === 0) {
      setSymptomTags([NO_SYMPTOMS_TAG]);
      setCustomSymptomTags([]);
      return;
    }

    setSymptomTags((current) => current.filter((tag) => tag !== NO_SYMPTOMS_TAG));
  }

  function toggleSymptom(tag: string) {
    setSaveError(null);
    setSymptomTags((current) => {
      const withoutNone = current.filter((entry) => entry !== NO_SYMPTOMS_TAG);
      return withoutNone.includes(tag) ? withoutNone.filter((entry) => entry !== tag) : [...withoutNone, tag];
    });
  }

  function closeCustomModal() {
    setCustomModalVisible(false);
    setCustomEntry('');
  }

  function submitCustomSymptom() {
    const trimmed = customEntry.trim();
    if (!trimmed) {
      return;
    }

    setSaveError(null);
    const matchingPreset = symptomOptions.find((option) => normalizeSymptom(option) === normalizeSymptom(trimmed));
    const nextSymptom = matchingPreset ?? trimmed;

    setSymptomTags((current) =>
      current.some((tag) => normalizeSymptom(tag) === normalizeSymptom(nextSymptom))
        ? current
        : [...current, nextSymptom],
    );

    if (!matchingPreset) {
      setCustomSymptomTags((current) =>
        current.some((tag) => normalizeSymptom(tag) === normalizeSymptom(trimmed))
          ? current
          : [...current, trimmed],
      );
    }

    setCustomEntry('');
  }

  function removeCustomSymptom(tag: string) {
    setSaveError(null);
    setCustomSymptomTags((current) => current.filter((entry) => entry !== tag));
    setSymptomTags((current) => current.filter((entry) => entry !== tag));
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setSaveError(null);
    setBusy(true);
    try {
      await upsertDailyReport({
        localDate: targetDate,
        gutSeverity,
        symptomTags: gutSeverity === 0 ? [NO_SYMPTOMS_TAG] : symptomTags.filter((tag) => tag !== NO_SYMPTOMS_TAG),
        notes: notes.trim() || undefined,
        evidenceQuality,
      });
      navigation.replace('DailyReportPayoff', { localDate: targetDate });
    } catch (error) {
      const normalizedError = getDailyReportSaveError(error);
      setSaveError(normalizedError.message);
      trackEvent('daily_gut_report_save_failed', {
        local_date: targetDate,
        error_code: normalizedError.code,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.screenContent}>
      <DetailScreenHeader eyebrow={dateLabel} />

      <SectionCard style={styles.heroCard}>
        <Text style={styles.heroQuestion}>How did your gut feel?</Text>
        <View style={styles.heroReadout}>
          <View style={styles.heroMetricWrap}>
            <HeroMetric value={gutSeverity} unit="/10" color={bandColor} />
            <Text style={[styles.heroBandPhrase, { color: bandColor }]}>{severityBandPhrase(gutSeverity)}</Text>
          </View>
          <Pip
            state={severityPipState(gutSeverity)}
            size={76}
            accessibilityLabel={`Pip reflecting a ${severityBandWord(gutSeverity)} day`}
          />
        </View>
        <SeveritySlider
          value={gutSeverity}
          onChange={handleSeverityChange}
          accessibilityLabel="How your gut felt, from 0 no symptoms to 10 worst symptoms"
        />
        <View style={styles.scaleLegend}>
          <Text style={styles.legendLabel}>No symptoms</Text>
          <Text style={styles.legendLabel}>Worst symptoms</Text>
        </View>
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>What did you feel?</Text>
          {gutSeverity > 0 ? <Text style={styles.optionalLabel}>Pick what fits</Text> : null}
        </View>
        {gutSeverity === 0 ? (
          <Text style={styles.quietNote}>No symptoms — we&apos;ll save this as a symptom-free day.</Text>
        ) : (
          <View style={styles.optionWrap}>
            {symptomOptions.map((tag) => (
              <OptionChip key={tag} label={tag} selected={symptomTags.includes(tag)} onPress={() => toggleSymptom(tag)} />
            ))}
            <OtherSymptomChip
              count={customSymptomTags.length}
              onPress={() => setCustomModalVisible(true)}
            />
          </View>
        )}
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <Text style={styles.fieldLabel}>Did you scan what you ate?</Text>
        <View style={styles.coverageStack}>
          <CoverageChoice
            label="Typical day — scanned what I ate"
            selected={evidenceQuality === 'typical'}
            onPress={() => setEvidenceQuality('typical')}
          />
          <CoverageChoice
            label="Ate things I didn't scan"
            selected={evidenceQuality === 'unscanned'}
            onPress={() => setEvidenceQuality('unscanned')}
          />
        </View>
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Anything else?</Text>
          <Text style={styles.optionalLabel}>Optional</Text>
        </View>
        <InputField
          value={notes}
          placeholder="Anything else from that day?"
          onChangeText={(value) => {
            setSaveError(null);
            setNotes(value);
          }}
          multiline
        />
      </SectionCard>

      {saveError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={tokens.color.status.danger.foreground} />
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      ) : null}

      {!canSave && !busy ? (
        <Text style={styles.saveHint}>Pick at least one symptom above and this is ready to save.</Text>
      ) : null}

      <PrimaryButton
        label={busy ? 'Saving...' : 'Save check-in'}
        onPress={() => void handleSave()}
        disabled={!canSave}
      />

      <Modal animationType="fade" transparent visible={customModalVisible} onRequestClose={closeCustomModal}>
        <View style={styles.customModalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close custom symptom entry"
            style={styles.customModalBackdrop}
            onPress={closeCustomModal}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={styles.customModalKeyboard}
          >
            <View style={styles.customModalCard}>
              <View style={styles.customModalHeader}>
                <View style={styles.customModalTitleWrap}>
                  <Text style={styles.customModalTitle}>Add a custom symptom</Text>
                  <Text style={styles.customModalSubtitle}>Add any symptom you want this daily report to track.</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={closeCustomModal}
                  style={({ pressed }) => [styles.customModalClose, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="close" size={20} color={tokens.color.icon.primary} />
                </Pressable>
              </View>
              <InputField
                value={customEntry}
                placeholder="Example: cramping, burping, trapped gas"
                onChangeText={setCustomEntry}
                autoFocus
              />
              <PrimaryButton label="Add" onPress={submitCustomSymptom} disabled={!customEntry.trim()} />
              {customSymptomTags.length > 0 ? (
                <View style={styles.customSymptomStack}>
                  {customSymptomTags.map((tag) => (
                    <View key={tag} style={styles.customSymptomPill}>
                      <Text style={styles.customSymptomText}>{tag}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${tag}`}
                        onPress={() => removeCustomSymptom(tag)}
                        hitSlop={8}
                        style={({ pressed }) => [styles.customSymptomRemove, pressed && { opacity: 0.7 }]}
                      >
                        <Ionicons name="close" size={12} color={palette.white} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </AppScreen>
  );
}

function OtherSymptomChip({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.otherChip, pressed && { opacity: 0.84 }]}
    >
      <Text style={styles.otherChipLabel}>Other</Text>
      {count > 0 ? (
        <View style={styles.otherChipBadge}>
          <Text style={styles.otherChipBadgeText}>+{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function CoverageChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.coverageChoice,
        selected && styles.coverageChoiceSelected,
        pressed && { opacity: 0.88 },
      ]}
    >
      <View style={[styles.coverageDot, selected && styles.coverageDotSelected]}>
        {selected ? <View style={styles.coverageDotInner} /> : null}
      </View>
      <Text style={[styles.coverageLabel, selected && styles.coverageLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function normalizeLocalDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return value;
}

function formatLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year ?? new Date().getFullYear(), (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// Text-grade band colors: the darker `foreground` tones keep the numeral and
// band phrase readable on the white card; the slider keeps the brighter tints
// for its fill — fills and text are different jobs.
function severityBandColor(value: number) {
  if (value <= 3) return tokens.color.status.risk.low.foreground;
  if (value <= 6) return tokens.color.status.risk.medium.foreground;
  return tokens.color.status.risk.high.foreground;
}

function severityBandWord(value: number) {
  if (value <= 3) return 'calm';
  if (value <= 6) return 'mixed';
  return 'rough';
}

function severityBandPhrase(value: number) {
  if (value === 0) return 'symptom-free — a calm day';
  if (value <= 3) return 'sounds like a calm day';
  if (value <= 6) return 'sounds like a mixed day';
  return 'sounds like a rough day';
}

function severityPipState(value: number): PipState {
  if (value <= 3) return 'joy';
  if (value <= 6) return 'base';
  return 'pain';
}

function normalizeSymptom(value: string) {
  return value.trim().toLowerCase();
}

function getDailyReportSaveError(error: unknown) {
  if (isApiErrorLike(error)) {
    if (error.code === 'network_retryable') {
      return {
        code: error.code,
        message: 'The report could not be saved because the connection dropped. Please try again.',
      };
    }

    return {
      code: error.code,
      message: error.message || 'The report could not be saved. Please try again.',
    };
  }

  if (error instanceof Error) {
    const isBlobResolutionError =
      error.name === 'AuthRetryableFetchError' ||
      /AuthRetryableFetchError/i.test(error.message) ||
      /Unable to resolve data for blob/i.test(error.message);

    return {
      code: isBlobResolutionError ? 'network_retryable' : error.name || 'daily_report_save_failed',
      message: isBlobResolutionError
        ? 'The report could not be saved because the connection dropped. Please try again.'
        : error.message || 'The report could not be saved. Please try again.',
    };
  }

  return {
    code: 'daily_report_save_failed',
    message: 'The report could not be saved. Please try again.',
  };
}

function isApiErrorLike(error: unknown): error is { code: string; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  heroCard: {
    gap: spacing.md,
  },
  heroQuestion: {
    ...tokens.type.display.hero,
    color: tokens.color.text.primary,
  },
  heroReadout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heroMetricWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  heroBandPhrase: {
    ...tokens.type.body.strong,
  },
  compactCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  scaleLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: palette.textMuted,
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
  quietNote: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  coverageStack: {
    gap: spacing.sm,
  },
  coverageChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: tokens.color.border.strong,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  coverageChoiceSelected: {
    backgroundColor: tokens.color.status.success.background,
    borderColor: tokens.color.border.emphasis,
  },
  coverageDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: tokens.color.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverageDotSelected: {
    borderColor: tokens.color.accent.brand,
  },
  coverageDotInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: tokens.color.accent.brand,
  },
  coverageLabel: {
    ...tokens.type.body.emphasis,
    flex: 1,
    color: tokens.color.text.primary,
  },
  coverageLabelSelected: {
    fontFamily: type.body.semibold,
    color: tokens.color.status.success.foreground,
  },
  otherChip: {
    ...components.chip.option,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  otherChipLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.text.primary,
  },
  otherChipBadge: {
    minWidth: 25,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    marginTop: -8,
  },
  otherChipBadgeText: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 11,
    lineHeight: 13,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: tokens.color.status.danger.foreground,
    backgroundColor: tokens.color.status.danger.background,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
  saveHint: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  customModalRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  customModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.color.overlay.scrim,
  },
  customModalKeyboard: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  customModalCard: {
    backgroundColor: tokens.color.surface.card.default,
    borderRadius: radii.xxl,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    padding: spacing.lg,
    gap: spacing.md,
    ...tokens.shadow.modal,
  },
  customModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  customModalTitleWrap: {
    flex: 1,
    gap: 4,
  },
  customModalTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  customModalSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  customModalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.surface.frosted,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  customSymptomStack: {
    gap: spacing.sm,
  },
  customSymptomPill: {
    minHeight: 46,
    borderRadius: radii.md,
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    position: 'relative',
  },
  customSymptomText: {
    color: palette.white,
    fontFamily: type.body.semibold,
    fontSize: 15,
    paddingRight: spacing.lg,
  },
  customSymptomRemove: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});

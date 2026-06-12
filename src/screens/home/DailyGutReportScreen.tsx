import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SeveritySlider } from '../../components/common/SeveritySlider';
import { AppScreen, DetailScreenHeader, InputField, OptionChip, PrimaryButton, SectionCard } from '../../components/common/UI';
import { symptomOptions } from '../../data/catalog';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyGutReport'>;

const NO_SYMPTOMS_TAG = 'None';

export function DailyGutReportScreen({ navigation, route }: Props) {
  const targetDate = route.params?.localDate ?? yesterdayLocalDate();
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
      <DetailScreenHeader eyebrow="Daily report" title={dateLabel} />

      <SectionCard style={[styles.scaleCard, styles.compactCard]}>
        <View style={styles.scaleHeader}>
          <Text style={styles.fieldLabel}>Gut severity</Text>
          <Text style={[styles.severityValue, { color: severityTone(gutSeverity) }]}>{gutSeverity}/10</Text>
        </View>
        <SeveritySlider value={gutSeverity} onChange={handleSeverityChange} />
        <View style={styles.scaleLegend}>
          <Text style={styles.legendLabel}>No symptoms</Text>
          <Text style={styles.legendLabel}>Worst symptoms</Text>
        </View>
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Symptoms</Text>
          <Text style={gutSeverity === 0 ? styles.optionalLabel : styles.requiredLabel}>
            {gutSeverity === 0 ? 'Auto selected' : 'Required'}
          </Text>
        </View>
        <View style={styles.optionWrap}>
          {gutSeverity === 0 ? (
            <OptionChip label={NO_SYMPTOMS_TAG} selected onPress={() => undefined} />
          ) : (
            <>
              {symptomOptions.map((tag) => (
                <OptionChip key={tag} label={tag} selected={symptomTags.includes(tag)} onPress={() => toggleSymptom(tag)} />
              ))}
              <OtherSymptomChip
                count={customSymptomTags.length}
                onPress={() => setCustomModalVisible(true)}
              />
            </>
          )}
        </View>
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Scan coverage</Text>
          <Text style={styles.optionalLabel}>Keeps learning honest</Text>
        </View>
        <View style={styles.optionWrap}>
          <OptionChip
            label="Typical day — scanned what I ate"
            selected={evidenceQuality === 'typical'}
            onPress={() => setEvidenceQuality('typical')}
          />
          <OptionChip
            label="Ate things I didn't scan"
            selected={evidenceQuality === 'unscanned'}
            onPress={() => setEvidenceQuality('unscanned')}
          />
        </View>
      </SectionCard>

      <SectionCard style={styles.compactCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.fieldLabel}>Notes</Text>
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

      <PrimaryButton
        label={busy ? 'Saving...' : 'Save report'}
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
  compactCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  scaleCard: {
    gap: spacing.sm,
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
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.1,
  },
  severityValue: {
    fontFamily: type.body.bold,
    fontSize: 20,
    letterSpacing: -0.4,
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
  requiredLabel: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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

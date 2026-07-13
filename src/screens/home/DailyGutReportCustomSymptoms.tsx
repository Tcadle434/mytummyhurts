import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { InputField, PrimaryButton } from '../../components/common/UI';
import { components, palette, radii, spacing, tokens, type } from '../../theme';

type OtherSymptomChipProps = {
  count: number;
  onPress: () => void;
};

export function OtherSymptomChip({ count, onPress }: OtherSymptomChipProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.otherChip, pressed && { opacity: 0.84 }]}>
      <Text style={styles.otherChipLabel}>Other</Text>
      {count > 0 ? (
        <View style={styles.otherChipBadge}>
          <Text style={styles.otherChipBadgeText}>+{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

type CustomSymptomModalProps = {
  customEntry: string;
  customSymptoms: string[];
  visible: boolean;
  onClose: () => void;
  onCustomEntryChange: (value: string) => void;
  onRemove: (symptom: string) => void;
  onSubmit: () => void;
};

export function CustomSymptomModal({
  customEntry,
  customSymptoms,
  visible,
  onClose,
  onCustomEntryChange,
  onRemove,
  onSubmit,
}: CustomSymptomModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.customModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close custom symptom entry"
          style={styles.customModalBackdrop}
          onPress={onClose}
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
                onPress={onClose}
                style={({ pressed }) => [styles.customModalClose, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="close" size={20} color={tokens.color.icon.primary} />
              </Pressable>
            </View>
            <InputField
              value={customEntry}
              placeholder="Example: cramping, burping, trapped gas"
              onChangeText={onCustomEntryChange}
              autoFocus
            />
            <PrimaryButton label="Add" onPress={onSubmit} disabled={!customEntry.trim()} />
            {customSymptoms.length > 0 ? (
              <View style={styles.customSymptomStack}>
                {customSymptoms.map((symptom) => (
                  <View key={symptom} style={styles.customSymptomPill}>
                    <Text style={styles.customSymptomText}>{symptom}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${symptom}`}
                      onPress={() => onRemove(symptom)}
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
  );
}

const styles = StyleSheet.create({
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

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radii, shadows, spacing, type } from '../../theme';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type SectionCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type OptionChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  rightAccessory?: ReactNode;
};

type InputFieldProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
};

export function AppScreen({ children, scroll = true, contentContainerStyle }: AppScreenProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.content, { paddingTop: insets.top + spacing.md }, contentContainerStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <LinearGradient
        colors={['#FAF5EC', '#EFF4EA', '#F5EFE3']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function ScreenHeader({ eyebrow, title, subtitle, rightAccessory }: ScreenHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerTextWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightAccessory ? <View style={styles.headerAccessory}>{rightAccessory}</View> : null}
    </View>
  );
}

export function Wordmark() {
  return (
    <View>
      <Text style={styles.wordmarkPrimary}>My</Text>
      <Text style={styles.wordmarkSerif}>Tummy</Text>
      <Text style={styles.wordmarkPrimary}>Hurts</Text>
    </View>
  );
}

export function SectionCard({ children, style }: SectionCardProps) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
}

export function FrostedSection({ children, style }: SectionCardProps) {
  return (
    <BlurView intensity={14} tint="light" style={[styles.frostedCard, style]}>
      {children}
    </BlurView>
  );
}

export function PrimaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (pressed || disabled) && { opacity: pressed ? 0.92 : 0.48 },
      ]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        (pressed || disabled) && { opacity: pressed ? 0.9 : 0.48 },
      ]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function OptionChip({ label, selected, onPress }: OptionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionChip,
        selected && styles.optionChipSelected,
        pressed && { opacity: 0.88 },
      ]}
    >
      <Text style={[styles.optionChipLabel, selected && styles.optionChipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function InfoPill({ label, tone = 'default' }: { label: string; tone?: 'default' | 'soft' | 'warm' }) {
  return (
    <View
      style={[
        styles.infoPill,
        tone === 'soft' && { backgroundColor: palette.sageSoft },
        tone === 'warm' && { backgroundColor: '#F6E6D7' },
      ]}
    >
      <Text style={styles.infoPillLabel}>{label}</Text>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function AvatarButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.88 }]}>
      <Text style={styles.avatarLabel}>You</Text>
    </Pressable>
  );
}

export function InputField({ value, placeholder, onChangeText, multiline }: InputFieldProps) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={palette.textMuted}
      onChangeText={onChangeText}
      multiline={multiline}
      style={[styles.input, multiline && styles.inputMultiline]}
    />
  );
}

export function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  glowOne: {
    position: 'absolute',
    top: 80,
    right: -10,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: 'rgba(221, 231, 213, 0.8)',
  },
  glowTwo: {
    position: 'absolute',
    top: 260,
    left: -50,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: 'rgba(246, 230, 215, 0.7)',
  },
  headerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  headerAccessory: {
    paddingTop: spacing.xs,
  },
  eyebrow: {
    color: palette.primary,
    fontFamily: type.body.semibold,
    fontSize: 12,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  screenTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 31,
    lineHeight: 36,
  },
  subtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  wordmarkPrimary: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 30,
    lineHeight: 30,
  },
  wordmarkSerif: {
    color: palette.primary,
    fontFamily: type.display.fontFamily,
    fontSize: 38,
    lineHeight: 36,
    marginVertical: -2,
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
    gap: spacing.md,
    ...shadows.card,
  },
  frostedCard: {
    borderRadius: radii.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.36)',
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: radii.pill,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    ...shadows.lift,
  },
  primaryButtonLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
  optionChip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
  },
  optionChipSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primaryDark,
  },
  optionChipLabel: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  optionChipLabelSelected: {
    color: palette.white,
  },
  infoPill: {
    alignSelf: 'flex-start',
    backgroundColor: palette.cardMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  infoPillLabel: {
    color: palette.primaryDark,
    fontFamily: type.body.semibold,
    fontSize: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailRowLabel: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  detailRowValue: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 14,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: palette.divider,
  },
  avatarButton: {
    minWidth: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  input: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    color: palette.text,
    fontFamily: type.body.regular,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  metricPill: {
    minWidth: 88,
    borderRadius: radii.md,
    backgroundColor: palette.cardMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  metricValue: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  metricLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
  },
});

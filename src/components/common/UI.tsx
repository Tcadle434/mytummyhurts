import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ComponentProps, ReactElement, ReactNode, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../../navigation/types';
import { components, radii, spacing, tokens, type } from '../../theme';
import { Pip } from './Pip';

const PICKER_PRESS_SPRING = { damping: 16, stiffness: 360, mass: 0.6 } as const;
const PICKER_RELEASE_SPRING = { damping: 14, stiffness: 220, mass: 0.7 } as const;
const PICKER_POP_UP_SPRING = { damping: 11, stiffness: 280, mass: 0.55 } as const;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  background?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  refreshControl?: ReactElement<import('react-native').RefreshControlProps>;
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type CardVariant = 'default' | 'warm' | 'success' | 'info';

type SectionCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
};

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

type OptionChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

type OnboardingPickerVariant = 'image' | 'plain';

type OnboardingPickerOptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  iconName?: IoniconName;
  badgeText?: string;
  variant?: OnboardingPickerVariant;
};

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  titleColor?: string;
  titleStyle?: StyleProp<TextStyle>;
  subtitleColor?: string;
  rightAccessory?: ReactNode;
  fullWidth?: boolean;
};

type InputFieldProps = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  autoFocus?: TextInputProps['autoFocus'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  keyboardType?: TextInputProps['keyboardType'];
  secureTextEntry?: boolean;
  textContentType?: TextInputProps['textContentType'];
};

type ScreenLayoutProps = {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

type InfoPillTone = 'default' | 'soft' | 'warm' | 'info' | 'danger' | 'riskLow' | 'riskMedium' | 'riskHigh';

export function ScreenLayout({ title, children, scroll = true, contentContainerStyle }: ScreenLayoutProps) {
  return (
    <AppScreen scroll={scroll} contentContainerStyle={contentContainerStyle}>
      {title ? (
        <View style={styles.layoutHeader}>
          <Text style={styles.layoutHeaderTitle}>{title}</Text>
        </View>
      ) : null}
      {children}
    </AppScreen>
  );
}

export function AppScreen({
  children,
  scroll = true,
  background,
  contentContainerStyle,
  keyboardAvoiding = true,
  refreshControl,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.content, { paddingTop: insets.top + spacing.md }, contentContainerStyle]}>{children}</View>
  );

  const screenContent = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      contentContainerStyle={styles.scrollContent}
      refreshControl={refreshControl}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  return (
    <View style={styles.screenFill}>
      {background}
      <SafeAreaView edges={['bottom']} style={styles.safeArea}>
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
            style={styles.keyboardAvoiding}
          >
            {screenContent}
          </KeyboardAvoidingView>
        ) : (
          screenContent
        )}
      </SafeAreaView>
    </View>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  titleColor,
  titleStyle,
  subtitleColor,
  rightAccessory,
  fullWidth,
}: ScreenHeaderProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const canGoBack = navigation.canGoBack();

  if (fullWidth) {
    return (
      <View style={styles.headerShell}>
        <View style={styles.headerCenterFull}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={[styles.screenTitle, titleColor ? { color: titleColor } : null, titleStyle]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.headerShell}>
      <View style={styles.headerTopRow}>
        <View style={styles.headerSide}>
          {canGoBack ? (
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.iconCircle, pressed && { opacity: 0.72 }]}>
              <Ionicons name="chevron-back" size={22} color={tokens.color.icon.primary} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        <View style={styles.headerCenter}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={[styles.screenTitle, titleColor ? { color: titleColor } : null, titleStyle]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerSide}>
          {rightAccessory ?? <View style={styles.headerSpacer} />}
        </View>
      </View>
    </View>
  );
}

type TabScreenHeaderProps = {
  title: string;
};

type DetailScreenHeaderProps = {
  eyebrow: string;
  title?: string;
  titleAccessory?: ReactNode;
};

export function TabScreenHeader({ title }: TabScreenHeaderProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return (
    <View style={styles.tabHeaderRow}>
      <Text style={styles.tabHeaderTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={() => navigation.navigate('Settings')}
        style={({ pressed }) => [styles.tabHeaderIconButton, pressed && { opacity: 0.78 }]}
      >
        <Ionicons name="person-circle-outline" size={22} color={tokens.color.icon.primary} />
      </Pressable>
    </View>
  );
}

export function DetailScreenHeader({ eyebrow, title, titleAccessory }: DetailScreenHeaderProps) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const canGoBack = navigation.canGoBack();

  return (
    <View style={styles.detailHeaderShell}>
      <View style={styles.detailHeaderTopRow}>
        <View style={styles.detailHeaderSide}>
          {canGoBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              hitSlop={8}
              style={({ pressed }) => [styles.iconCircle, pressed && { opacity: 0.72 }]}
            >
              <Ionicons name="chevron-back" size={22} color={tokens.color.icon.primary} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        <Text style={styles.detailEyebrow}>{eyebrow.toUpperCase()}</Text>
        <View style={styles.detailHeaderSide} />
      </View>
      {title || titleAccessory ? (
        <View style={styles.detailTitleRow}>
          {title ? (
            <Text style={styles.detailTitle} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {titleAccessory ? (
            <View style={styles.detailTitleAccessory}>{titleAccessory}</View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Wordmark() {
  return (
    <Text style={styles.wordmarkWrap}>
      <Text style={styles.wordmarkStrong}>My</Text>
      <Text style={styles.wordmarkSoft}>Tummy</Text>
      <Text style={styles.wordmarkStrong}>Hurts</Text>
    </Text>
  );
}

export function SectionCard({ children, style, variant = 'default' }: SectionCardProps) {
  return <View style={[getCardStyle(variant), style]}>{children}</View>;
}

export function SkeletonBlock({ width = '100%', height, radius = radii.md, style }: SkeletonBlockProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.skeletonBlock,
        {
          width,
          height,
          borderRadius: radius,
        },
        style,
      ]}
    />
  );
}

export function FrostedSection({ children, style }: SectionCardProps) {
  return (
    <View style={[styles.frostedCard, style]}>
      <LinearGradient colors={[tokens.color.surface.frosted, 'rgba(255,255,255,0.66)']} style={StyleSheet.absoluteFill} />
      {children}
    </View>
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
        disabled && styles.primaryButtonDisabled,
        pressed && !disabled && { opacity: 0.9 },
      ]}
    >
      <Text style={[styles.primaryButtonLabel, disabled && styles.primaryButtonLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, (pressed || disabled) && { opacity: pressed ? 0.88 : 0.5 }]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function GreenOutlineButton({ label, onPress, disabled }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.quietButton, (pressed || disabled) && { opacity: pressed ? 0.88 : 0.5 }]}
    >
      <Text style={styles.quietButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function OptionChip({ label, selected, onPress }: OptionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.optionChip, selected && styles.optionChipSelected, pressed && { opacity: 0.84 }]}
    >
      <Text style={[styles.optionChipLabel, selected && styles.optionChipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingPickerOption({
  label,
  selected,
  onPress,
  iconName,
  badgeText,
  variant = 'plain',
}: OnboardingPickerOptionProps) {
  const colors = getOnboardingPickerColors(variant, selected);
  const pair = getOnboardingPickerColorPair(variant);
  const selectedness = useSharedValue(selected ? 1 : 0);
  const scale = useSharedValue(1);
  const previousSelectedRef = useRef(selected);

  useEffect(() => {
    selectedness.value = withTiming(selected ? 1 : 0, { duration: 220 });
    if (!previousSelectedRef.current && selected) {
      scale.value = withSequence(
        withSpring(1.04, PICKER_POP_UP_SPRING),
        withSpring(1, PICKER_RELEASE_SPRING),
      );
    }
    previousSelectedRef.current = selected;
  }, [selected, selectedness, scale]);

  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      selectedness.value,
      [0, 1],
      [pair.backgroundFrom, pair.backgroundTo],
    ),
    borderColor: interpolateColor(
      selectedness.value,
      [0, 1],
      [pair.borderFrom, pair.borderTo],
    ),
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, PICKER_PRESS_SPRING);
  }

  function handlePressOut() {
    if (!selected) {
      scale.value = withSpring(1, PICKER_RELEASE_SPRING);
    }
  }

  function handlePress() {
    void Haptics.selectionAsync();
    onPress();
  }

  return (
    <Animated.View style={[styles.onboardingPickerOption, containerStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.onboardingPickerHit}
      >
        {iconName ? (
          <View
            style={[styles.onboardingPickerIconSlot, { backgroundColor: colors.iconBackground }]}
          >
            <Ionicons name={iconName} size={16} color={colors.icon} />
          </View>
        ) : null}
        <View style={styles.onboardingPickerLabelWrap}>
          <Text
            numberOfLines={2}
            style={[
              styles.onboardingPickerLabel,
              {
                color: colors.text,
                flex: badgeText ? 0 : 1,
                textAlign: 'left',
              },
            ]}
          >
            {label}
          </Text>
          {badgeText ? (
            <View
              style={[styles.onboardingPickerBadge, { backgroundColor: colors.badgeBackground }]}
            >
              <Text style={[styles.onboardingPickerBadgeLabel, { color: colors.badgeText }]}>
                {badgeText}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function InfoPill({ label, tone = 'default' }: { label: string; tone?: InfoPillTone }) {
  const pillStyle = getPillStyle(tone);

  return (
    <View style={[styles.infoPill, { backgroundColor: pillStyle.backgroundColor }]}>
      <Text style={[styles.infoPillLabel, { color: pillStyle.color }]}>{label}</Text>
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.avatarButton, pressed && { opacity: 0.82 }]}>
      <Ionicons name="person-outline" size={18} color={tokens.color.icon.accent} />
    </Pressable>
  );
}

export function InputField({
  value,
  placeholder,
  onChangeText,
  multiline,
  autoFocus,
  autoCapitalize,
  autoComplete,
  keyboardType,
  secureTextEntry,
  textContentType,
}: InputFieldProps) {
  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      placeholderTextColor={tokens.color.text.tertiary}
      onChangeText={onChangeText}
      multiline={multiline}
      autoFocus={autoFocus}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      textContentType={textContentType}
      style={[styles.input, multiline && styles.inputMultiline]}
    />
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <SectionCard style={styles.emptyState}>
      <Pip state="waving" size={108} />
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
    </SectionCard>
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

export function PipAnalysisCard({ title = "Pip's take", body }: { title?: string; body: string }) {
  return (
    <View style={styles.pipCard}>
      <View style={styles.pipHeader}>
        <View style={styles.pipAvatarContainer}>
          <Pip state="subtle" size={42} />
        </View>
        <View style={styles.pipHeaderText}>
          <Text style={styles.pipTitle}>{title}</Text>
          <Text style={styles.pipSubtitle}>Personalized from your profile</Text>
        </View>
        <Ionicons name="sparkles" size={18} color={tokens.color.icon.accent} />
      </View>
      <Text style={styles.pipBody}>{body}</Text>
    </View>
  );
}

function getCardStyle(variant: CardVariant) {
  if (variant === 'warm') return styles.sectionCardWarm;
  if (variant === 'success') return styles.sectionCardSuccess;
  if (variant === 'info') return styles.sectionCardInfo;
  return styles.sectionCard;
}

function getPillStyle(tone: InfoPillTone) {
  switch (tone) {
    case 'soft':
      return {
        backgroundColor: components.badge.soft.backgroundColor,
        color: components.badge.soft.foreground,
      };
    case 'warm':
      return {
        backgroundColor: components.badge.warm.backgroundColor,
        color: components.badge.warm.foreground,
      };
    case 'info':
      return {
        backgroundColor: components.badge.info.backgroundColor,
        color: components.badge.info.foreground,
      };
    case 'danger':
      return {
        backgroundColor: components.badge.danger.background,
        color: components.badge.danger.foreground,
      };
    case 'riskLow':
      return {
        backgroundColor: components.badge.risk.low.background,
        color: components.badge.risk.low.foreground,
      };
    case 'riskMedium':
      return {
        backgroundColor: components.badge.risk.medium.background,
        color: components.badge.risk.medium.foreground,
      };
    case 'riskHigh':
      return {
        backgroundColor: components.badge.risk.high.background,
        color: components.badge.risk.high.foreground,
      };
    default:
      return {
        backgroundColor: components.badge.default.backgroundColor,
        color: components.badge.default.foreground,
      };
  }
}

function getOnboardingPickerColorPair(variant: OnboardingPickerVariant) {
  if (variant === 'image') {
    return {
      backgroundFrom: 'rgba(255,255,255,0.94)',
      backgroundTo: tokens.color.accent.brand,
      borderFrom: tokens.color.border.subtle,
      borderTo: tokens.color.accent.brand,
    };
  }

  return {
    backgroundFrom: tokens.color.surface.card.default,
    backgroundTo: tokens.color.status.success.background,
    borderFrom: tokens.color.border.subtle,
    borderTo: tokens.color.border.emphasis,
  };
}

function getOnboardingPickerColors(variant: OnboardingPickerVariant, selected: boolean) {
  if (variant === 'image') {
    return {
      background: selected ? tokens.color.accent.brand : 'rgba(255,255,255,0.94)',
      border: selected ? tokens.color.accent.brand : tokens.color.border.subtle,
      text: selected ? tokens.color.text.inverse : tokens.color.text.primary,
      icon: selected ? tokens.color.text.inverse : tokens.color.icon.primary,
      iconBackground: selected ? 'rgba(255,255,255,0.18)' : tokens.color.status.success.background,
      badgeBackground: selected ? 'rgba(255,255,255,0.18)' : tokens.color.accent.brand,
      badgeText: tokens.color.text.inverse,
    };
  }

  return {
    background: selected ? tokens.color.status.success.background : tokens.color.surface.card.default,
    border: selected ? tokens.color.border.emphasis : tokens.color.border.subtle,
    text: selected ? tokens.color.status.success.foreground : tokens.color.text.primary,
    icon: selected ? tokens.color.status.success.foreground : tokens.color.icon.primary,
    iconBackground: selected ? 'rgba(47,110,84,0.12)' : tokens.color.surface.card.warm,
    badgeBackground: tokens.color.accent.brand,
    badgeText: tokens.color.text.inverse,
  };
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
    backgroundColor: tokens.color.surface.app.default,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardAvoiding: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  layoutHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  layoutHeaderTitle: {
    ...tokens.type.title.block,
    color: tokens.color.text.primary,
  },
  headerShell: {
    gap: spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerSide: {
    width: 44,
    alignItems: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 2,
  },
  headerCenterFull: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: 2,
  },
  detailHeaderShell: {
    width: '100%',
    gap: spacing.md,
  },
  detailHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  detailHeaderSide: {
    width: 44,
    alignItems: 'center',
  },
  detailEyebrow: {
    flex: 1,
    ...tokens.type.label.eyebrow,
    color: tokens.color.text.tertiary,
    textAlign: 'center',
    letterSpacing: 1.2,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  detailTitle: {
    flex: 1,
    ...tokens.type.title.screen,
    color: tokens.color.text.primary,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  detailTitleAccessory: {
    flexShrink: 0,
  },
  tabHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tabHeaderTitle: {
    flex: 1,
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  tabHeaderIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: tokens.color.surface.frosted,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    ...tokens.type.label.eyebrow,
    color: tokens.color.text.tertiary,
  },
  screenTitle: {
    ...tokens.type.title.screen,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    ...tokens.type.body.default,
    color: tokens.color.text.tertiary,
    textAlign: 'center',
  },
  wordmarkWrap: {
    fontSize: 20,
  },
  wordmarkStrong: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 20,
  },
  wordmarkSoft: {
    color: tokens.color.text.accent,
    fontFamily: type.display.fontFamily,
    fontSize: 22,
  },
  sectionCard: {
    ...components.card.default,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardWarm: {
    ...components.card.warm,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardSuccess: {
    ...components.card.success,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionCardInfo: {
    ...components.card.info,
    padding: spacing.lg,
    gap: spacing.md,
  },
  frostedCard: {
    ...components.card.frosted,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonBlock: {
    backgroundColor: tokens.color.chart.track,
    opacity: 0.7,
  },
  primaryButton: {
    ...components.button.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: tokens.color.chart.track,
    elevation: 0,
    shadowOpacity: 0,
  },
  primaryButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.primary.foreground,
  },
  primaryButtonLabelDisabled: {
    color: tokens.color.text.tertiary,
  },
  secondaryButton: {
    ...components.button.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.secondary.foreground,
  },
  quietButton: {
    ...components.button.quiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietButtonLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.quiet.foreground,
  },
  optionChip: {
    ...components.chip.option,
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderColor: tokens.color.border.strong,
  },
  optionChipSelected: {
    ...components.chip.optionSelected,
  },
  optionChipLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.text.primary,
  },
  optionChipLabelSelected: {
    color: tokens.color.text.inverse,
  },
  onboardingPickerOption: {
    width: '100%',
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    ...tokens.shadow.card,
  },
  onboardingPickerHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  onboardingPickerBadge: {
    minWidth: 28,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginTop: -7,
  },
  onboardingPickerBadgeLabel: {
    fontFamily: type.body.bold,
    fontSize: 12,
    lineHeight: 14,
  },
  onboardingPickerIconSlot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingPickerLabel: {
    ...tokens.type.body.strong,
  },
  onboardingPickerLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  infoPillLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailRowLabel: {
    ...tokens.type.body.default,
    flex: 1,
    color: tokens.color.text.tertiary,
  },
  detailRowValue: {
    ...tokens.type.body.strong,
    flex: 1,
    color: tokens.color.text.primary,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border.strong,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    ...components.input,
    paddingHorizontal: spacing.md,
    color: tokens.color.text.primary,
    fontFamily: type.body.regular,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 64,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyStateTitle: {
    ...tokens.type.title.card,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    ...tokens.type.body.default,
    color: tokens.color.text.tertiary,
    textAlign: 'center',
  },
  metricPill: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    gap: 2,
  },
  metricValue: {
    ...tokens.type.metric.value,
    color: tokens.color.text.primary,
  },
  metricLabel: {
    ...tokens.type.metric.label,
    color: tokens.color.text.tertiary,
  },
  pipCard: {
    ...components.card.success,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pipHeaderText: {
    flex: 1,
    gap: 2,
  },
  pipAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipTitle: {
    ...tokens.type.title.block,
    color: tokens.color.text.primary,
  },
  pipSubtitle: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
  },
  pipBody: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.primary,
  },
});

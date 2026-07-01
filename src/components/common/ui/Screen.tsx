import { Ionicons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { ReactElement, ReactNode, Ref } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { RootStackParamList } from '../../../navigation/types';
import { spacing, tokens, type } from '../../../theme';
import { Pip } from '../Pip';
import { SectionCard } from './Cards';

type AppScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  background?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  refreshControl?: ReactElement<import('react-native').RefreshControlProps>;
  scrollViewRef?: Ref<ScrollView>;
};

type ScreenLayoutProps = {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
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

type TabScreenHeaderProps = {
  title: string;
};

type DetailScreenHeaderProps = {
  eyebrow: string;
  title?: string;
  titleAccessory?: ReactNode;
};

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

/**
 * The ambient canvas the token file always designed but never shipped: two
 * soft mint/peach ornament blobs behind the content. Subtle enough to keep
 * every screen readable, present enough that screens stop feeling like flat
 * cream sheets.
 */
function CanvasOrnaments() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.ornamentMint} />
      <View style={styles.ornamentPeach} />
    </View>
  );
}

export function AppScreen({
  children,
  scroll = true,
  background,
  contentContainerStyle,
  keyboardAvoiding = true,
  refreshControl,
  scrollViewRef,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.content, { paddingTop: insets.top + spacing.md }, contentContainerStyle]}>{children}</View>
  );

  const screenContent = scroll ? (
    <ScrollView
      ref={scrollViewRef}
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
      {background ?? <CanvasOrnaments />}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.iconCircle, pressed && { opacity: 0.72 }]}
            >
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

export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SectionCard style={styles.emptyState}>
      <Pip state="waving" size={108} />
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateSubtitle}>{subtitle}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.emptyStateAction, pressed && { opacity: 0.88 }]}
        >
          <Text style={styles.emptyStateActionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </SectionCard>
  );
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
  emptyStateAction: {
    marginTop: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.action.primary.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateActionLabel: {
    ...tokens.type.label.button,
    color: tokens.color.action.primary.foreground,
  },
  ornamentMint: {
    position: 'absolute',
    top: -110,
    right: -120,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: tokens.color.surface.app.ornamentMint,
    opacity: 0.5,
  },
  ornamentPeach: {
    position: 'absolute',
    bottom: -140,
    left: -130,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: tokens.color.surface.app.ornamentPeach,
    opacity: 0.42,
  },
});

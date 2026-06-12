import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeToToasts, ToastPayload, ToastTone } from '../../services/toast';
import { palette, radii, spacing, tokens, type } from '../../theme';

type ToastProviderProps = {
  children: ReactNode;
};

const DEFAULT_DURATION_MS = 2600;

const toneStyles: Record<ToastTone, { icon: keyof typeof Ionicons.glyphMap; iconBackground: string; iconColor: string }> = {
  success: {
    icon: 'checkmark',
    iconBackground: tokens.color.status.success.background,
    iconColor: tokens.color.status.success.foreground,
  },
  info: {
    icon: 'sparkles',
    iconBackground: tokens.color.info.background,
    iconColor: tokens.color.icon.accent,
  },
  error: {
    icon: 'alert',
    iconBackground: tokens.color.status.danger.background,
    iconColor: tokens.color.status.danger.foreground,
  },
};

export function ToastProvider({ children }: ToastProviderProps) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const toastRef = useRef<ToastPayload | null>(null);
  const translateY = useRef(new Animated.Value(-24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setVisibleToast = useCallback((nextToast: ToastPayload | null) => {
    toastRef.current = nextToast;
    setToast(nextToast);
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const hideVisibleToast = useCallback(
    (id?: string) => {
      if (id && toastRef.current?.id !== id) {
        return;
      }

      clearHideTimer();
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -12,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setVisibleToast(null);
          translateY.setValue(-24);
        }
      });
    },
    [clearHideTimer, opacity, setVisibleToast, translateY],
  );

  useEffect(() => {
    return subscribeToToasts((command) => {
      if (command.type === 'hide') {
        hideVisibleToast(command.id);
        return;
      }

      clearHideTimer();

      const nextToast: ToastPayload = {
        tone: 'success',
        durationMs: DEFAULT_DURATION_MS,
        ...command.toast,
      };
      setVisibleToast(nextToast);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      if (nextToast.durationMs !== null) {
        hideTimer.current = setTimeout(() => {
          hideVisibleToast(nextToast.id);
        }, nextToast.durationMs ?? DEFAULT_DURATION_MS);
      }
    });
  }, [clearHideTimer, hideVisibleToast, opacity, setVisibleToast, translateY]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  const tone = toast?.tone ?? 'success';
  const resolvedTone = toneStyles[tone];

  return (
    <View style={styles.root}>
      {children}
      <View pointerEvents="none" style={[styles.toastLayer, { top: insets.top + spacing.sm }]}>
        {toast ? (
          <Animated.View
            style={[
              styles.toast,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={[styles.iconShell, { backgroundColor: resolvedTone.iconBackground }]}>
              <Ionicons name={resolvedTone.icon} size={18} color={resolvedTone.iconColor} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.message}>{toast.message}</Text>
              {toast.detail ? <Text style={styles.detail}>{toast.detail}</Text> : null}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toastLayer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 420,
    minHeight: 60,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: palette.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: palette.shadow,
    shadowOpacity: Platform.select({ ios: 0.16, default: 0.12 }),
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  iconShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  message: {
    color: tokens.color.text.primary,
    fontFamily: type.body.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  detail: {
    color: tokens.color.text.secondary,
    fontFamily: type.body.medium,
    fontSize: 12,
    lineHeight: 16,
  },
});

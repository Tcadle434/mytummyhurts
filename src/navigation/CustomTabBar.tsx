import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radii, shadows, spacing, type } from '../theme';

const labels: Record<string, string> = {
  Home: 'Home',
  History: 'History',
  Insights: 'Insights',
};

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + spacing.sm }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const descriptor = descriptors[route.key];

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.82 }]}
            >
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelFocused]}>{labels[route.name] ?? route.name}</Text>
              <View style={[styles.tabIndicator, isFocused && styles.tabIndicatorFocused]} />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() =>
          navigation.getParent()?.navigate('ScanCapture', {
            sourceType: 'camera',
            manualMode: false,
            fromOnboarding: false,
          })
        }
        style={({ pressed }) => [styles.scanButton, pressed && { transform: [{ scale: 0.97 }] }]}
      >
        <Text style={styles.scanPlus}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'transparent',
  },
  bar: {
    height: 72,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 252, 246, 0.95)',
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.lift,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  tabLabel: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 13,
  },
  tabLabelFocused: {
    color: palette.primary,
  },
  tabIndicator: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: 'transparent',
  },
  tabIndicatorFocused: {
    backgroundColor: palette.primary,
  },
  scanButton: {
    position: 'absolute',
    alignSelf: 'center',
    top: -18,
    width: 76,
    height: 76,
    borderRadius: 99,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: palette.background,
    ...shadows.lift,
  },
  scanPlus: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 34,
    marginTop: -2,
  },
});

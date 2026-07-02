import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { navigationRef } from './navigationRef';
import { trackEvent } from '../services/analytics';
import { components, shadows, spacing, tokens, type } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type TabRoute = BottomTabBarProps['state']['routes'][number];

const tabConfig: Record<string, { label: string; icon: IconName; iconFocused: IconName }> = {
  Home: { label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  History: { label: 'Scans', icon: 'scan-outline', iconFocused: 'scan' },
  Insights: { label: 'Triggers', icon: 'search-outline', iconFocused: 'search' },
  Symptoms: { label: 'Symptoms', icon: 'pulse-outline', iconFocused: 'pulse' },
};

const SCAN_BUTTON_DIAMETER = 60;
const SCAN_SLOT_WIDTH = SCAN_BUTTON_DIAMETER + 4;
const TAB_BAR_HEIGHT = 74;
const TAB_BAR_BOTTOM_OFFSET = -4;
const TAB_LAYOUT_TRANSITION = LinearTransition.springify().damping(22).stiffness(200).mass(0.7);

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const splitIndex = Math.ceil(state.routes.length / 2);
  const leftRoutes = state.routes.slice(0, splitIndex);
  const rightRoutes = state.routes.slice(splitIndex);

  function handleScanPress() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackEvent('scan_camera_opened', { entry_point: 'tab_bar_plus' });
    if (navigationRef.isReady()) {
      navigationRef.navigate('ScanCapture', {
        sourceType: 'camera',
        manualMode: false,
        scanCategory: 'food',
        initialMode: 'food',
      });
    }
  }

  function handleTabPress(routeName: string, isFocused: boolean) {
    if (!isFocused) {
      void Haptics.selectionAsync();
    }
    navigation.navigate(routeName);
  }

  function renderTab(route: TabRoute, routeIndex: number) {
    const isFocused = state.index === routeIndex;
    const config = tabConfig[route.name] ?? {
      label: route.name,
      icon: 'ellipse-outline' as IconName,
      iconFocused: 'ellipse' as IconName,
    };

    return (
      <Animated.View
        key={route.key}
        layout={TAB_LAYOUT_TRANSITION}
        style={[styles.tabWrap, isFocused && styles.tabWrapFocused]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={config.label}
          accessibilityState={{ selected: isFocused }}
          onPress={() => handleTabPress(route.name, isFocused)}
          style={({ pressed }) => [
            styles.tab,
            isFocused && styles.tabFocused,
            pressed && { opacity: 0.82 },
          ]}
        >
          <Ionicons
            name={isFocused ? config.iconFocused : config.icon}
            size={22}
            color={
              isFocused ? tokens.color.action.primary.foreground : components.tabBar.inactiveTint
            }
          />
          {isFocused ? (
            <Animated.Text
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(120)}
              style={styles.tabLabelFocused}
              numberOfLines={1}
            >
              {config.label}
            </Animated.Text>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + TAB_BAR_BOTTOM_OFFSET }]}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {leftRoutes.map((route, index) => renderTab(route, index))}
        </View>
        <View style={styles.scanSlot} />
        <View style={styles.side}>
          {rightRoutes.map((route, index) => renderTab(route, index + splitIndex))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a scan"
        onPress={handleScanPress}
        hitSlop={6}
        style={({ pressed }) => [
          styles.scanButton,
          {
            bottom:
              insets.bottom + TAB_BAR_BOTTOM_OFFSET + TAB_BAR_HEIGHT - SCAN_BUTTON_DIAMETER / 2,
          },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
      >
        <Ionicons name="add" size={32} color={tokens.color.text.inverse} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  bar: {
    ...components.tabBar.shell,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tabWrap: {
    flex: 1,
  },
  tabWrapFocused: {
    flex: 3,
  },
  tab: {
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  // Active pill sits on the one anchor color; its icon + label flip to
  // porcelain (action foreground), never the light text ramp.
  tabFocused: {
    backgroundColor: tokens.color.accent.brand,
  },
  tabLabelFocused: {
    ...tokens.type.label.tab,
    color: tokens.color.action.primary.foreground,
    fontFamily: type.body.bold,
  },
  scanSlot: {
    width: SCAN_SLOT_WIDTH,
  },
  scanButton: {
    position: 'absolute',
    alignSelf: 'center',
    width: SCAN_BUTTON_DIAMETER,
    height: SCAN_BUTTON_DIAMETER,
    borderRadius: SCAN_BUTTON_DIAMETER / 2,
    backgroundColor: tokens.color.accent.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: tokens.color.surface.app.default,
    ...shadows.lift,
  },
});

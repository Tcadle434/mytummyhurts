import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { components, spacing, tokens, type } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const tabConfig: Record<string, { label: string; icon: IconName; iconFocused: IconName }> = {
  Home: { label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  History: { label: 'Scans', icon: 'scan-outline', iconFocused: 'scan' },
  Insights: { label: 'Insights', icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
  Symptoms: { label: 'Symptoms', icon: 'pulse-outline', iconFocused: 'pulse' },
};

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 4 }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = tabConfig[route.name] ?? { label: route.name, icon: 'ellipse-outline' as IconName, iconFocused: 'ellipse' as IconName };

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.82 }]}
            >
              <Ionicons
                name={isFocused ? config.iconFocused : config.icon}
                size={22}
                color={isFocused ? components.tabBar.activeTint : components.tabBar.inactiveTint}
              />
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelFocused]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: 'transparent',
  },
  bar: {
    ...components.tabBar.shell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    ...tokens.type.label.tab,
    color: components.tabBar.inactiveTint,
  },
  tabLabelFocused: {
    color: components.tabBar.activeTint,
    fontFamily: type.body.semibold,
  },
});

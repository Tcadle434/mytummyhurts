import { StyleSheet, View } from 'react-native';

import { spacing, tokens } from '../../theme';

export function SettingsRowDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.color.border.subtle,
    marginLeft: spacing.md + 34 + spacing.sm,
  },
});

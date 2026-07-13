import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, tokens } from '../../theme';

type SettingsExpandedBlockProps = {
  children: ReactNode;
};

export function SettingsExpandedBlock({ children }: SettingsExpandedBlockProps) {
  return <View style={styles.expandedBlock}>{children}</View>;
}

const styles = StyleSheet.create({
  expandedBlock: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border.subtle,
  },
});

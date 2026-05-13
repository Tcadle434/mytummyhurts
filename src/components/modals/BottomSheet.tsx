import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { components, spacing } from '../../theme';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: components.bottomSheet.backdrop,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...components.bottomSheet.shell,
    gap: spacing.md,
  },
  handle: {
    ...components.bottomSheet.handle,
    alignSelf: 'center',
  },
});

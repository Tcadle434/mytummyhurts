import { Alert, Linking } from 'react-native';

export async function openIfPresent(url: string) {
  await Linking.openURL(url);
}

export function openLegalSurface(url: string, fallback: () => void) {
  if (!url || url.includes('example.com')) {
    fallback();
    return;
  }

  void openIfPresent(url).catch(() => {
    fallback();
  });
}

export function openDeleteConfirmation(onConfirm: () => void) {
  Alert.alert(
    'Delete account?',
    'This permanently removes your scans, history, insights, and saved profile data.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ],
  );
}

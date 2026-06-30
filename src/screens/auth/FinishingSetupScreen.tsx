import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton } from '../../components/common/UI';
import { signOut } from '../../services/auth';
import { useAppStore } from '../../store/useAppStore';
import { palette, spacing, tokens, type } from '../../theme';

export function FinishingSetupScreen() {
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const serverSyncError = useAppStore((state) => state.serverSyncError);
  const completeAuthSetup = useAppStore((state) => state.completeAuthSetup);
  const refreshRemoteState = useAppStore((state) => state.refreshRemoteState);
  const busy = serverSyncInFlight;

  async function handleRetry() {
    if (initialServerSyncNeeded) {
      await completeAuthSetup();
      return;
    }

    await refreshRemoteState();
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <View style={styles.body}>
        <ActivityIndicator color={palette.primary} size="large" />
        <View style={styles.copy}>
          <Text style={styles.title}>Finishing setup</Text>
          <Text style={styles.subtitle}>
            We are verifying your subscription and saving your profile before opening the app.
          </Text>
          {serverSyncError ? <Text style={styles.error}>{serverSyncError}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        {serverSyncError ? (
          <PrimaryButton label={busy ? 'Retrying...' : 'Retry'} onPress={() => void handleRetry()} disabled={busy} />
        ) : null}
        <Text accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
          Sign out
        </Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 320,
  },
  title: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 28,
    lineHeight: 34,
    textAlign: 'center',
  },
  subtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  error: {
    color: tokens.color.status.danger.foreground,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.md,
    alignItems: 'center',
  },
  signOut: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.semibold,
    fontSize: 14,
    lineHeight: 20,
  },
});

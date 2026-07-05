import { StyleSheet, Text, View } from 'react-native';

import { Pip } from '../../components/common/Pip';
import { AppScreen, PrimaryButton } from '../../components/common/UI';
import { signOut } from '../../services/auth';
import { useAppStore } from '../../store/useAppStore';
import { spacing, tokens, type } from '../../theme';

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
        <Pip state="thinking" size={112} accessibilityLabel="Pip is getting things ready" />
        <View style={styles.copy}>
          <Text style={styles.title}>Getting things ready</Text>
          <Text style={styles.subtitle}>
            Pip is checking your subscription and saving your profile. This only takes a moment.
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
    ...tokens.type.display.section,
    color: tokens.color.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    ...tokens.type.body.default,
    color: tokens.color.text.secondary,
    textAlign: 'center',
  },
  error: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    color: tokens.color.status.danger.foreground,
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

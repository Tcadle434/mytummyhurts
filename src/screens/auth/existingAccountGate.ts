import { apiClient } from '../../services/api/client';
import { signOutSupabase } from '../../services/auth';
import { showToast } from '../../services/toast';
import { useAppStore } from '../../store/useAppStore';

const SHORTCUT_REJECTION_MESSAGE = 'Please commit onboarding first';

export async function verifyExistingAccountSignIn({
  cleanupFreshUnentitledUser,
  onRejected,
}: {
  cleanupFreshUnentitledUser: boolean;
  onRejected: () => void;
}) {
  const response = await apiClient.checkExistingAccount({ cleanupFreshUnentitledUser });

  if (response.allowed) {
    try {
      await useAppStore.getState().refreshRemoteState();
    } catch (error) {
      console.warn('[auth] Existing account remote refresh failed after gate passed.', error);
    }
    useAppStore.getState().setOnboardingStage('complete');
    return true;
  }

  await signOutSupabase();
  useAppStore.getState().setOnboardingStage('intro');
  onRejected();
  showToast({
    message: SHORTCUT_REJECTION_MESSAGE,
    tone: 'error',
    durationMs: 3600,
  });
  return false;
}

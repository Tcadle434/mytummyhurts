import { apiClient } from '../../services/api/client';
import { signOut } from '../../services/auth';
import { showToast } from '../../services/toast';
import { useAppStore } from '../../store/useAppStore';

const SHORTCUT_REJECTION_MESSAGE = 'Please commit onboarding first';
const MISSING_ENTITLEMENT_MESSAGE = 'Choose a plan or restore your subscription to continue.';
const INCOMPLETE_PROFILE_MESSAGE = 'Finish your profile setup to continue.';

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

  if (response.reason === 'missing_entitlement') {
    useAppStore.getState().setOnboardingStage('paywall');
    showToast({
      message: MISSING_ENTITLEMENT_MESSAGE,
      tone: 'error',
      durationMs: 3600,
    });
    return false;
  }

  if (response.reason === 'incomplete_profile') {
    useAppStore.getState().setOnboardingStage('flow');
    showToast({
      message: INCOMPLETE_PROFILE_MESSAGE,
      tone: 'info',
      durationMs: 3600,
    });
    return false;
  }

  await signOut();
  useAppStore.getState().setOnboardingStage('intro');
  onRejected();
  showToast({
    message: SHORTCUT_REJECTION_MESSAGE,
    tone: 'error',
    durationMs: 3600,
  });
  return false;
}

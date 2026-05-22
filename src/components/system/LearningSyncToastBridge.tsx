import { useEffect, useRef } from 'react';

import { showToast } from '../../services/toast';
import { useAppStore } from '../../store/useAppStore';

const LEARNING_SYNC_TOAST_ID = 'learning-sync';

export function LearningSyncToastBridge() {
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const learningSyncError = useAppStore((state) => state.learningSyncError);
  const wasInFlight = useRef(false);

  useEffect(() => {
    if (learningSyncInFlight) {
      wasInFlight.current = true;
      showToast({
        id: LEARNING_SYNC_TOAST_ID,
        message: 'Report saved',
        detail: 'Updating your scores...',
        tone: 'success',
        durationMs: null,
      });
      return;
    }

    if (!wasInFlight.current) {
      return;
    }

    wasInFlight.current = false;
    showToast({
      id: LEARNING_SYNC_TOAST_ID,
      message: learningSyncError ? 'Report saved' : 'Scores updated',
      detail: learningSyncError ? 'We will keep syncing in the background.' : undefined,
      tone: learningSyncError ? 'info' : 'success',
      durationMs: learningSyncError ? 3200 : 1800,
    });
  }, [learningSyncError, learningSyncInFlight]);

  return null;
}

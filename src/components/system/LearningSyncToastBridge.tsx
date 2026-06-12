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
        detail: 'Queueing your learning update...',
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
      message: 'Report saved',
      detail: learningSyncError ? 'We will keep syncing in the background.' : 'Your scores will update shortly.',
      tone: learningSyncError ? 'info' : 'success',
      durationMs: learningSyncError ? 3200 : 2400,
    });
  }, [learningSyncError, learningSyncInFlight]);

  return null;
}

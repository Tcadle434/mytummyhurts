import { useEffect, useRef } from 'react';

import { showToast } from '../../services/toast';
import { useAppStore } from '../../store/useAppStore';

const LEARNING_SYNC_TOAST_ID = 'learning-sync';

// One auto-dismissing toast per daily-report save. Never sticky: the toast
// must not depend on the sync settling (a dropped connection once left the
// "Queueing your learning update" toast on screen permanently).
export function LearningSyncToastBridge() {
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const learningSyncSource = useAppStore((state) => state.learningSyncSource);
  const wasInFlight = useRef(false);

  useEffect(() => {
    if (!learningSyncInFlight) {
      wasInFlight.current = false;
      return;
    }

    if (wasInFlight.current || learningSyncSource !== 'daily_report') {
      return;
    }

    wasInFlight.current = true;
    showToast({
      id: LEARNING_SYNC_TOAST_ID,
      message: 'Report saved',
      detail: 'Your scores will update in the background.',
      tone: 'success',
    });
  }, [learningSyncInFlight, learningSyncSource]);

  return null;
}

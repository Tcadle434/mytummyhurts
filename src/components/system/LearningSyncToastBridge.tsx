import { useEffect, useRef } from 'react';

import { showToast } from '../../services/toast';
import { useAppStore } from '../../store/useAppStore';

const LEARNING_SYNC_TOAST_ID = 'learning-sync';

// Reserved for explicit background recompute messaging. Daily-report saves land
// on the payoff screen, so a second toast is noisy and makes the flow feel
// disconnected from the saved report.
export function LearningSyncToastBridge() {
  const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
  const learningSyncSource = useAppStore((state) => state.learningSyncSource);
  const wasInFlight = useRef(false);

  useEffect(() => {
    if (!learningSyncInFlight) {
      wasInFlight.current = false;
      return;
    }

    if (wasInFlight.current || learningSyncSource !== 'recompute') {
      return;
    }

    wasInFlight.current = true;
    showToast({
      id: LEARNING_SYNC_TOAST_ID,
      message: 'Learning update running',
      detail: 'Your profile will refresh in the background.',
      tone: 'success',
    });
  }, [learningSyncInFlight, learningSyncSource]);

  return null;
}

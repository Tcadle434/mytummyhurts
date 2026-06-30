import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { remoteConfig } from '../../../config/remoteConfig';
import { trackEvent } from '../../../services/analytics';
import {
  ensureDailyCheckinScheduled,
  ensureNotificationPermission,
  ensureWeeklyReportScheduled,
  registerDailyReportNotifications,
} from '../../../services/notifications';
import { useAppStore } from '../../../store/useAppStore';

const PERMISSION_PROMPTED_KEY = 'notifications.permissionPrompted';

export function NotificationSchedulerBridge() {
  const onboardingStage = useAppStore((state) => state.onboardingStage);
  const authUser = useAppStore((state) => state.authUser);
  const dailyReports = useAppStore((state) => state.dailyReports);
  const scans = useAppStore((state) => state.scans);
  const registeredPushRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = onboardingStage === 'complete' && Boolean(authUser);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    async function syncSchedule() {
      try {
        // First entry after onboarding: surface the iOS permission dialog once
        // (the priming step in onboarding sets this up). Later runs are silent.
        const alreadyPrompted = await AsyncStorage.getItem(PERMISSION_PROMPTED_KEY);
        if (!alreadyPrompted) {
          await AsyncStorage.setItem(PERMISSION_PROMPTED_KEY, 'yes');
          const granted = await ensureNotificationPermission();
          trackEvent('notification_permission_resolved', { granted });
        }

        if (cancelled) {
          return;
        }

        await ensureDailyCheckinScheduled({
          reports: dailyReports,
          scans,
        });
        await ensureWeeklyReportScheduled({
          accountCreatedAt: useAppStore.getState().authUser?.createdAt ?? null,
        });

        if (remoteConfig.featureFlags.livePush && !registeredPushRef.current) {
          registeredPushRef.current = true;
          // Token registration is not launch-critical; defer it off the
          // first-paint window so it doesn't contend with home/history fetches.
          pushTimerRef.current = setTimeout(() => {
            void registerDailyReportNotifications().catch((error) => {
              console.warn('[notifications] push token registration failed', error);
            });
          }, 8000);
        }
      } catch (error) {
        console.warn('[notifications] daily check-in scheduling failed', error);
      }
    }

    void syncSchedule();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncSchedule();
      }
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [active, dailyReports, scans]);

  return null;
}

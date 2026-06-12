import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { navigationRef } from '../../../navigation/navigationRef';
import { trackEvent } from '../../../services/analytics';
import {
  DAILY_CHECKIN_TYPE,
  WEEKLY_REPORT_TYPE,
  severityForCheckinAction,
} from '../../../services/notifications/dailyCheckin';
import { useAppStore } from '../../../store/useAppStore';

export function NotificationResponseBridge() {
  const handledResponseRef = useRef<string | null>(null);

  useEffect(() => {
    function openDailyReport(localDate?: string) {
      trackEvent('daily_report_push_opened', { local_date: localDate });
      if (navigationRef.isReady()) {
        navigationRef.navigate('DailyGutReport', { localDate });
      }
    }

    // One-tap check-in: the notification action carries the severity; save the
    // report immediately and land on the payoff screen. A body tap (default
    // action) opens the full report form instead.
    function handleCheckinResponse(localDate: string, actionIdentifier: string) {
      const severity = severityForCheckinAction(actionIdentifier);
      if (severity === null) {
        openDailyReport(localDate);
        return;
      }

      trackEvent('daily_checkin_action_tapped', {
        local_date: localDate,
        severity,
      });
      void useAppStore
        .getState()
        .upsertDailyReport({ localDate, gutSeverity: severity })
        .catch((error) => {
          console.warn('[notifications] one-tap report failed', error);
        });
      if (navigationRef.isReady()) {
        navigationRef.navigate('DailyReportPayoff', { localDate });
      }
    }

    function handleResponse(response: Notifications.NotificationResponse) {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponseRef.current === responseKey) {
        return;
      }
      handledResponseRef.current = responseKey;

      const data = response.notification.request.content.data;
      const localDate = typeof data?.localDate === 'string' ? data.localDate : undefined;

      if (data?.type === DAILY_CHECKIN_TYPE && localDate) {
        handleCheckinResponse(localDate, response.actionIdentifier);
        return;
      }

      if (data?.type === WEEKLY_REPORT_TYPE) {
        trackEvent('weekly_report_notification_opened');
        if (navigationRef.isReady()) {
          navigationRef.navigate('WeeklyProgress');
        }
        return;
      }

      if (data?.type === 'daily_gut_report') {
        openDailyReport(localDate);
      }
    }

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}

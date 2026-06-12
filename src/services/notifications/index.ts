import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '../api/client';
import type { DailyGutReport, ScanHistorySummary } from '../../types/domain';
import {
  CHECKIN_ACTION_CALM,
  CHECKIN_ACTION_MEH,
  CHECKIN_ACTION_ROUGH,
  DAILY_CHECKIN_CATEGORY,
  DAILY_CHECKIN_TYPE,
  DEFAULT_CHECKIN_HOUR,
  DEFAULT_CHECKIN_MINUTE,
  WEEKLY_REPORT_TYPE,
  buildDailyCheckinContent,
  latestScanTitleForDate,
  planDailyCheckinSchedule,
} from './dailyCheckin';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHECKIN_HOUR_STORAGE_KEY = 'notifications.dailyCheckinHour';
const CHECKIN_MINUTE_STORAGE_KEY = 'notifications.dailyCheckinMinute';

export async function getDailyReportNotificationStatus() {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerDailyReportNotifications() {
  if (Platform.OS !== 'ios') {
    throw new Error('Daily report reminders are only configured for iPhone right now.');
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions =
    currentPermissions.granted || currentPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? currentPermissions
      : await Notifications.requestPermissionsAsync();

  if (!permissions.granted && permissions.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    throw new Error('Notifications are turned off for this app.');
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const pushToken =
    typeof deviceToken.data === 'string' ? deviceToken.data : JSON.stringify(deviceToken.data ?? '');

  if (!pushToken) {
    throw new Error('A device push token could not be created.');
  }

  await apiClient.registerNotificationToken({
    pushToken,
    platform: 'ios',
  });

  return pushToken;
}

// Requests permission at most once per install (the iOS dialog only shows
// once anyway; afterwards Settings is the only path). Returns granted state.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  if (!current.canAskAgain) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return (
    requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function ensureDailyCheckinCategory() {
  if (Platform.OS !== 'ios') {
    return;
  }

  await Notifications.setNotificationCategoryAsync(DAILY_CHECKIN_CATEGORY, [
    {
      identifier: CHECKIN_ACTION_CALM,
      buttonTitle: '😌 Calm',
      options: { opensAppToForeground: true },
    },
    {
      identifier: CHECKIN_ACTION_MEH,
      buttonTitle: '😐 Meh',
      options: { opensAppToForeground: true },
    },
    {
      identifier: CHECKIN_ACTION_ROUGH,
      buttonTitle: '😖 Rough',
      options: { opensAppToForeground: true },
    },
  ]);
}

export async function getDailyCheckinTimePreference() {
  const [hourValue, minuteValue] = await Promise.all([
    AsyncStorage.getItem(CHECKIN_HOUR_STORAGE_KEY),
    AsyncStorage.getItem(CHECKIN_MINUTE_STORAGE_KEY),
  ]);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  return {
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_CHECKIN_HOUR,
    minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULT_CHECKIN_MINUTE,
  };
}

export async function setDailyCheckinTimePreference(hour: number, minute: number) {
  await Promise.all([
    AsyncStorage.setItem(CHECKIN_HOUR_STORAGE_KEY, String(hour)),
    AsyncStorage.setItem(CHECKIN_MINUTE_STORAGE_KEY, String(minute)),
  ]);
}

// Replaces all scheduled daily check-ins with a fresh 7-day plan. Runs on
// foreground, after report saves, and after scan completion so today's copy
// stays scan-aware and reported days drop off. No-op without permission.
export async function ensureDailyCheckinScheduled(params: {
  reports: Pick<DailyGutReport, 'localDate'>[];
  scans: Pick<ScanHistorySummary, 'dishName' | 'createdAt' | 'scanCategory'>[];
}) {
  if (Platform.OS !== 'ios') {
    return;
  }

  const permissions = await Notifications.getPermissionsAsync();
  const allowed =
    permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) {
    return;
  }

  await ensureDailyCheckinCategory();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((entry) => entry.content.data?.type === DAILY_CHECKIN_TYPE)
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
  );

  const preference = await getDailyCheckinTimePreference();
  const slots = planDailyCheckinSchedule({
    now: new Date(),
    reportedDates: new Set(params.reports.map((report) => report.localDate)),
    preferredHour: preference.hour,
    preferredMinute: preference.minute,
  });

  await Promise.all(
    slots.map((slot) => {
      const content = buildDailyCheckinContent({
        isToday: slot.isToday,
        scanTitle: slot.isToday ? latestScanTitleForDate(params.scans, slot.localDate) : null,
      });

      return Notifications.scheduleNotificationAsync({
        content: {
          title: content.title,
          body: content.body,
          categoryIdentifier: DAILY_CHECKIN_CATEGORY,
          data: {
            type: DAILY_CHECKIN_TYPE,
            localDate: slot.localDate,
            screen: 'DailyGutReport',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slot.fireAt,
        },
      });
    }),
  );
}

// Weekly report nudges: a one-shot "Week 1" summary on day 6 (inside the
// trial window) and a recurring Sunday-evening report thereafter. Both
// deep-link to the WeeklyProgress screen.
export async function ensureWeeklyReportScheduled(params: { accountCreatedAt?: string | null }) {
  if (Platform.OS !== 'ios') {
    return;
  }

  const permissions = await Notifications.getPermissionsAsync();
  const allowed =
    permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) {
    return;
  }

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((entry) => entry.content.data?.type === WEEKLY_REPORT_TYPE)
      .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
  );

  const requests: Promise<string>[] = [];

  const createdAt = params.accountCreatedAt ? new Date(params.accountCreatedAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const weekOneAt = new Date(createdAt);
    weekOneAt.setDate(weekOneAt.getDate() + 6);
    weekOneAt.setHours(18, 0, 0, 0);
    if (weekOneAt.getTime() > Date.now()) {
      requests.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Your Week 1 gut report is ready',
            body: 'See what your first week of scans and check-ins revealed.',
            data: { type: WEEKLY_REPORT_TYPE, screen: 'WeeklyProgress' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: weekOneAt,
          },
        }),
      );
    }
  }

  requests.push(
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your week, decoded',
        body: 'Gut Score movement, calm days, and trigger evidence from this week.',
        data: { type: WEEKLY_REPORT_TYPE, screen: 'WeeklyProgress' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1,
        hour: 18,
        minute: 0,
      },
    }),
  );

  await Promise.all(requests);
}

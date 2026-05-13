import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

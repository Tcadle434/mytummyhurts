import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiClient } from '../api/client';
import { MealRecord, ScanRecord } from '../../types/domain';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function getMealFollowupNotificationStatus() {
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function registerMealFollowupNotifications() {
  if (Platform.OS !== 'ios') {
    throw new Error('Follow-up notifications are only configured for iPhone right now.');
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

export async function syncLocalMealFollowupNotification(meal: MealRecord, scan?: ScanRecord) {
  if (Platform.OS !== 'ios' || meal.followupState !== 'pending' || !meal.followupDueAt) {
    return null;
  }

  const enabled = await getMealFollowupNotificationStatus();
  if (!enabled) {
    return null;
  }

  await cancelLocalMealFollowupNotification(meal.id);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Did you eat ${meal.title || scan?.dishName || 'that meal'}?`,
      body: 'Tell us how your stomach felt so future scans get sharper.',
      sound: true,
      data: {
        type: 'meal_followup',
        mealId: meal.id,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(meal.followupDueAt),
    },
  });
}

export async function cancelLocalMealFollowupNotification(mealId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const matching = scheduled.filter((entry) => entry.content.data?.mealId === mealId);
  await Promise.all(matching.map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)));
}

export function subscribeToMealFollowupNotificationResponses(callback: (mealId: string) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const mealId = response.notification.request.content.data?.mealId;
    if (typeof mealId === 'string' && mealId.length > 0) {
      callback(mealId);
    }
  });

  return () => {
    subscription.remove();
  };
}

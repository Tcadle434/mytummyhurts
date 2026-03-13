import { posthogClient } from './posthog';

type AnalyticsProperties = Record<string, string | number | boolean | undefined | null>;

const eventLog: Array<{ name: string; properties: AnalyticsProperties; ts: string }> = [];

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  const normalizedProperties = Object.entries(properties).reduce<Record<string, string | number | boolean | null>>(
    (accumulator, [key, value]) => {
      if (value !== undefined) {
        accumulator[key] = value;
      }
      return accumulator;
    },
    {},
  );
  const payload = { name, properties, ts: new Date().toISOString() };
  eventLog.push(payload);

  posthogClient?.capture(name, normalizedProperties);

  if (__DEV__) {
    console.log('[analytics]', payload);
  }
}

export function getTrackedEvents() {
  return eventLog;
}

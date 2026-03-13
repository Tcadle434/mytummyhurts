import PostHog from 'posthog-react-native';

import { env, isPostHogConfigured } from '../../config/env';

export const posthogClient = isPostHogConfigured
  ? new PostHog(env.posthogKey, {
      host: env.posthogHost,
      persistence: 'file',
      captureAppLifecycleEvents: true,
    })
  : null;

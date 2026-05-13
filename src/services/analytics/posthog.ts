import PostHog from 'posthog-react-native';

import { env, shouldUsePostHog } from '../../config/env';

export const posthogClient = shouldUsePostHog
  ? new PostHog(env.posthogKey, {
      host: env.posthogHost,
      persistence: 'file',
      captureAppLifecycleEvents: true,
    })
  : null;

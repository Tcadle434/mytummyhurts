import * as Sentry from '@sentry/react-native';

import { env } from './config/env';
import { RootNavigator } from './navigation/RootNavigator';
import { AppProviders } from './providers/AppProviders';

const sentryEnabled = Boolean(env.sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: env.sentryDsn,
    enableAutoSessionTracking: true,
    tracesSampleRate: 0.2,
    // Health-adjacent app: never attach request/response bodies or PII.
    sendDefaultPii: false,
  });
}

function App() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

export default sentryEnabled ? Sentry.wrap(App) : App;

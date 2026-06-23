import { useEffect } from 'react';

import { restoreSession } from '../../../services/auth';

// Restores the persisted self-hosted session (access/refresh tokens in
// expo-secure-store) into the app store on launch.
export function SessionBridge() {
  useEffect(() => {
    restoreSession().catch((error) => {
      console.warn('[auth] failed to restore session', error);
    });
  }, []);

  return null;
}

import { useEffect } from 'react';

import { useAppStore } from '../../../store/useAppStore';

export function RemoteBootstrapBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const syncInitialAccountState = useAppStore((state) => state.syncInitialAccountState);
  const refreshRemoteState = useAppStore((state) => state.refreshRemoteState);

  useEffect(() => {
    if (!authUser || serverSyncInFlight) {
      return;
    }

    if (initialServerSyncNeeded) {
      void syncInitialAccountState().catch((error) => {
        console.warn('[bootstrap] failed to sync initial account state', error);
      });
      return;
    }

    if (!remoteDataLoaded) {
      void refreshRemoteState().catch((error) => {
        console.warn('[bootstrap] failed to hydrate remote state', error);
      });
    }
  }, [authUser, initialServerSyncNeeded, refreshRemoteState, remoteDataLoaded, serverSyncInFlight, syncInitialAccountState]);

  return null;
}

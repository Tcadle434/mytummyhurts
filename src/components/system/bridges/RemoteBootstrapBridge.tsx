import { useEffect } from 'react';

import { useAppStore } from '../../../store/useAppStore';

export function RemoteBootstrapBridge() {
  const authUser = useAppStore((state) => state.authUser);
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
  const syncInitialAccountState = useAppStore((state) => state.syncInitialAccountState);
  const refreshRemoteState = useAppStore((state) => state.refreshRemoteState);
  const activeScanAnalysis = useAppStore((state) => state.activeScanAnalysis);
  const scanAnalysisInFlight = useAppStore((state) => state.scanAnalysisInFlight);
  const resumeActiveScanAnalysis = useAppStore((state) => state.resumeActiveScanAnalysis);

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
      return;
    }

    if (activeScanAnalysis && !scanAnalysisInFlight) {
      void resumeActiveScanAnalysis();
    }
  }, [
    activeScanAnalysis,
    authUser,
    initialServerSyncNeeded,
    refreshRemoteState,
    remoteDataLoaded,
    resumeActiveScanAnalysis,
    scanAnalysisInFlight,
    serverSyncInFlight,
    syncInitialAccountState,
  ]);

  return null;
}

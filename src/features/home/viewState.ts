export type HomeRemoteStateInput = {
  isLiveBackendConfigured: boolean;
  hasAuthUser: boolean;
  hasRemoteQueryData: boolean;
  hasFallbackHomeData: boolean;
  remoteDataLoaded: boolean;
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
  queryLoading: boolean;
  queryFetching: boolean;
  queryError: boolean;
};

export function shouldBlockHomeForInitialRemoteData(input: HomeRemoteStateInput) {
  return Boolean(
    input.isLiveBackendConfigured &&
      input.hasAuthUser &&
      !input.hasRemoteQueryData &&
      !input.hasFallbackHomeData &&
      (!input.remoteDataLoaded ||
        input.initialServerSyncNeeded ||
        input.serverSyncInFlight ||
        input.queryLoading ||
        (!input.hasRemoteQueryData && input.queryFetching)) &&
      !input.queryError,
  );
}

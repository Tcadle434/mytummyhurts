import { describe, expect, it } from 'vitest';

import { shouldBlockHomeForInitialRemoteData } from '../viewState';

const baseInput = {
  isLiveBackendConfigured: true,
  hasAuthUser: true,
  hasRemoteQueryData: false,
  hasFallbackHomeData: false,
  remoteDataLoaded: false,
  initialServerSyncNeeded: false,
  serverSyncInFlight: false,
  queryLoading: true,
  queryFetching: true,
  queryError: false,
};

describe('shouldBlockHomeForInitialRemoteData', () => {
  it('shows skeletons for a true live cold load with no snapshot or fallback data', () => {
    expect(shouldBlockHomeForInitialRemoteData(baseInput)).toBe(true);
  });

  it('paints persisted data even when remoteDataLoaded is false and initial sync is pending', () => {
    expect(
      shouldBlockHomeForInitialRemoteData({
        ...baseInput,
        hasFallbackHomeData: true,
        initialServerSyncNeeded: true,
      }),
    ).toBe(false);
  });

  it('paints snapshot data even while the query is still refetching', () => {
    expect(
      shouldBlockHomeForInitialRemoteData({
        ...baseInput,
        hasRemoteQueryData: true,
        remoteDataLoaded: true,
      }),
    ).toBe(false);
  });

  it('does not keep skeletons up after a home-get error', () => {
    expect(
      shouldBlockHomeForInitialRemoteData({
        ...baseInput,
        queryError: true,
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { getHistoryContentState } from '../viewState';

describe('getHistoryContentState', () => {
  it('shows skeletons during the initial remote load when no selected-tab fallback rows exist', () => {
    expect(
      getHistoryContentState({
        hasVisibleRows: false,
        hasSelectedFallbackRows: false,
        hasRemoteData: false,
        isInitialLoading: true,
      }),
    ).toBe('skeleton');
  });

  it('keeps selected-tab fallback rows visible during the initial remote load', () => {
    expect(
      getHistoryContentState({
        hasVisibleRows: true,
        hasSelectedFallbackRows: true,
        hasRemoteData: false,
        isInitialLoading: true,
      }),
    ).toBe('content');
  });

  it('shows the empty state after remote data has loaded with no rows', () => {
    expect(
      getHistoryContentState({
        hasVisibleRows: false,
        hasSelectedFallbackRows: false,
        hasRemoteData: true,
        isInitialLoading: false,
      }),
    ).toBe('empty');
  });

  it('shows rows after remote data has loaded with rows', () => {
    expect(
      getHistoryContentState({
        hasVisibleRows: true,
        hasSelectedFallbackRows: false,
        hasRemoteData: true,
        isInitialLoading: false,
      }),
    ).toBe('content');
  });
});

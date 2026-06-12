import { describe, expect, it } from 'vitest';

import { getHistoryContentState, resolveHistoryView } from '../viewState';
import type { ScanHistorySummary } from '../../../types/domain';

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


function summary(id: string, scanCategory: 'food' | 'menu' | 'grocery', createdAt = '2026-06-01T12:00:00Z'): ScanHistorySummary {
  return {
    id,
    sourceType: 'camera',
    scanCategory,
    analysisStatus: 'completed',
    tokenCost: 1,
    createdAt,
    dishName: id,
    overallRiskScore: 20,
    overallRiskLevel: 'low',
  } as ScanHistorySummary;
}

describe('resolveHistoryView', () => {
  const foodRows = [summary('f1', 'food'), summary('f2', 'food', '2026-06-02T12:00:00Z')];
  const groceryFallback = [summary('g1', 'grocery')];

  it('cold start: no data anywhere while fetching shows skeletons', () => {
    const view = resolveHistoryView({
      remoteScans: null,
      fallbackScans: [],
      selectedFilter: 'food',
      isPlaceholderData: false,
      isFetching: true,
      isLoading: true,
      hasData: false,
    });
    expect(view.contentState).toBe('skeleton');
    expect(view.visibleScans).toEqual([]);
  });

  it('loaded remote rows render as content, newest first', () => {
    const view = resolveHistoryView({
      remoteScans: foodRows,
      fallbackScans: [],
      selectedFilter: 'food',
      isPlaceholderData: false,
      isFetching: false,
      isLoading: false,
      hasData: true,
    });
    expect(view.contentState).toBe('content');
    expect(view.visibleScans.map((scan) => scan.id)).toEqual(['f2', 'f1']);
  });

  it('filter switch with cached rows: placeholder pages from the prior filter defer to store rows', () => {
    // Regression: switching to Grocery showed the empty state even though the
    // store had grocery scans, because placeholder food pages filtered to zero.
    const view = resolveHistoryView({
      remoteScans: foodRows,
      fallbackScans: groceryFallback,
      selectedFilter: 'grocery',
      isPlaceholderData: true,
      isFetching: true,
      isLoading: false,
      hasData: true,
    });
    expect(view.contentState).toBe('content');
    expect(view.visibleScans.map((scan) => scan.id)).toEqual(['g1']);
  });

  it('filter switch without cached rows: shows skeletons, never a premature empty state', () => {
    // Regression: switching to Menu flashed "Nothing here yet" while the
    // menu page was still loading behind placeholder food rows.
    const view = resolveHistoryView({
      remoteScans: foodRows,
      fallbackScans: [],
      selectedFilter: 'menu',
      isPlaceholderData: true,
      isFetching: true,
      isLoading: false,
      hasData: true,
    });
    expect(view.contentState).toBe('skeleton');
  });

  it('confirmed empty: real fetch settled with zero rows shows the empty state', () => {
    const view = resolveHistoryView({
      remoteScans: [],
      fallbackScans: [],
      selectedFilter: 'menu',
      isPlaceholderData: false,
      isFetching: false,
      isLoading: false,
      hasData: true,
    });
    expect(view.contentState).toBe('empty');
  });

  it('placeholder rows that match the selected filter stay visible (same-filter refetch)', () => {
    const view = resolveHistoryView({
      remoteScans: foodRows,
      fallbackScans: groceryFallback,
      selectedFilter: 'food',
      isPlaceholderData: true,
      isFetching: true,
      isLoading: false,
      hasData: true,
    });
    expect(view.visibleScans.map((scan) => scan.id)).toEqual(['f2', 'f1']);
    expect(view.contentState).toBe('content');
  });

  it('mock mode: no remote query, store rows render directly', () => {
    const view = resolveHistoryView({
      remoteScans: null,
      fallbackScans: groceryFallback,
      selectedFilter: 'grocery',
      isPlaceholderData: false,
      isFetching: false,
      isLoading: false,
      hasData: false,
    });
    expect(view.contentState).toBe('content');
    expect(view.visibleScans.map((scan) => scan.id)).toEqual(['g1']);
  });
});

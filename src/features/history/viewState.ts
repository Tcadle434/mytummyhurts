import type { ScanCategory, ScanHistorySummary } from '../../types/domain';

export type HistoryContentState = 'content' | 'skeleton' | 'empty';

type HistoryContentStateInput = {
  hasVisibleRows: boolean;
  hasSelectedFallbackRows: boolean;
  hasRemoteData: boolean;
  isInitialLoading: boolean;
};

export function getHistoryContentState({
  hasVisibleRows,
  hasSelectedFallbackRows,
  hasRemoteData,
  isInitialLoading,
}: HistoryContentStateInput): HistoryContentState {
  if (hasVisibleRows) {
    return 'content';
  }

  if (isInitialLoading && !hasRemoteData && !hasSelectedFallbackRows) {
    return 'skeleton';
  }

  return 'empty';
}

export function filterScansByCategory(scans: ScanHistorySummary[], filter: ScanCategory) {
  return scans
    // History only shows finished scans. Failed/in-flight rows (e.g. a non-food
    // photo the analyzer correctly rejected) carry nothing the user can act on.
    .filter((scan) => scan.analysisStatus === 'completed')
    .filter((scan) => (scan.scanCategory ?? 'food') === filter)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

type HistoryViewInput = {
  remoteScans: ScanHistorySummary[] | null;
  fallbackScans: ScanHistorySummary[];
  selectedFilter: ScanCategory;
  /** react-query: data present but it belongs to a previous filter (keepPreviousData). */
  isPlaceholderData: boolean;
  isFetching: boolean;
  isLoading: boolean;
  hasData: boolean;
};

export type HistoryView = {
  visibleScans: ScanHistorySummary[];
  contentState: HistoryContentState;
};

/**
 * Decides what the history list renders while filters switch.
 *
 * While keepPreviousData shows the prior filter's pages, those rows usually
 * filter to zero for the new category — prefer the store's own rows for
 * instant content (e.g. grocery scans already cached locally), show skeletons
 * when nothing local matches either, and only show the empty state once the
 * real filtered result has arrived.
 */
export function resolveHistoryView({
  remoteScans,
  fallbackScans,
  selectedFilter,
  isPlaceholderData,
  isFetching,
  isLoading,
  hasData,
}: HistoryViewInput): HistoryView {
  const isShowingPlaceholder = isPlaceholderData && isFetching;

  let scans: ScanHistorySummary[];
  if (!remoteScans) {
    scans = fallbackScans;
  } else if (isShowingPlaceholder && filterScansByCategory(remoteScans, selectedFilter).length === 0) {
    scans = fallbackScans;
  } else {
    scans = remoteScans;
  }

  const visibleScans = filterScansByCategory(scans, selectedFilter);
  const contentState = getHistoryContentState({
    hasVisibleRows: visibleScans.length > 0,
    hasSelectedFallbackRows: filterScansByCategory(fallbackScans, selectedFilter).length > 0,
    hasRemoteData: hasData && !isShowingPlaceholder,
    isInitialLoading: isLoading || isShowingPlaceholder || (!hasData && isFetching),
  });

  return { visibleScans, contentState };
}

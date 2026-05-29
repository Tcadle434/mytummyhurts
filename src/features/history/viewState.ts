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

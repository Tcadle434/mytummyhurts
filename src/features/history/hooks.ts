import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { isLiveBackendConfigured } from '../../config/env';
import { apiClient } from '../../services/api/client';
import { queryKeys } from '../../services/query/keys';
import { ScanHistorySummary } from '../../types/domain';

type HistoryGroup = {
  label: string;
  items: ScanHistorySummary[];
};

function formatGroupLabel(isoDate: string) {
  const target = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const targetDay = target.toDateString();
  if (targetDay === today.toDateString()) {
    return 'Today';
  }

  if (targetDay === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return target.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

export function groupHistoryScans(scans: ScanHistorySummary[]) {
  const groups = new Map<string, ScanHistorySummary[]>();

  for (const scan of scans) {
    const label = formatGroupLabel(scan.createdAt);
    const current = groups.get(label) ?? [];
    current.push(scan);
    groups.set(label, current);
  }

  return Array.from(groups.entries()).map<HistoryGroup>(([label, items]) => ({
    label,
    items,
  }));
}

export function useHistoryFeed(pageSize = 20) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.history, pageSize],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiClient.getHistory({
        page: pageParam,
        pageSize,
      }),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: isLiveBackendConfigured,
  });
}

export function useScanDetail(scanId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.scan(scanId),
    queryFn: () => apiClient.getScan({ scanId }),
    enabled: isLiveBackendConfigured && enabled,
  });
}

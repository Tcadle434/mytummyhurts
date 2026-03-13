import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../services/api/client';
import { queryKeys } from '../../services/query/keys';

export function useInsightsData(search: string) {
  return useQuery({
    queryKey: [...queryKeys.insights, search],
    queryFn: () =>
      apiClient.getInsights({
        search: search.trim() || undefined,
      }),
  });
}

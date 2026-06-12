import { useQuery } from '@tanstack/react-query';

import { isLiveBackendConfigured } from '../../config/env';
import { apiClient } from '../../services/api/client';
import { queryKeys } from '../../services/query/keys';
import { useAppStore } from '../../store/useAppStore';

export function useInsightsData(search: string) {
  const authUser = useAppStore((state) => state.authUser);

  return useQuery({
    queryKey: [...queryKeys.insights, search],
    queryFn: () =>
      apiClient.getInsights({
        search: search.trim() || undefined,
      }),
    enabled: isLiveBackendConfigured && Boolean(authUser),
  });
}

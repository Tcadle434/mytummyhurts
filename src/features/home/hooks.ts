import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { isLiveBackendConfigured } from '../../config/env';
import { apiClient } from '../../services/api/client';
import { queryKeys } from '../../services/query/keys';
import { useAppStore } from '../../store/useAppStore';

export function useHomeData() {
  const authUser = useAppStore((state) => state.authUser);
  const applyHomeResponse = useAppStore((state) => state.applyHomeResponse);
  const query = useQuery({
    queryKey: queryKeys.home,
    queryFn: () => apiClient.getHome(),
    enabled: isLiveBackendConfigured && Boolean(authUser),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (query.data) {
      applyHomeResponse(query.data);
    }
  }, [applyHomeResponse, query.data]);

  return query;
}

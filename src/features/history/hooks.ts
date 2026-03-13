import { useInfiniteQuery } from '@tanstack/react-query';

import { apiClient } from '../../services/api/client';
import { queryKeys } from '../../services/query/keys';
import { MealRecord } from '../../types/domain';

type HistoryGroup = {
  label: string;
  items: MealRecord[];
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

export function groupHistoryMeals(meals: MealRecord[]) {
  const groups = new Map<string, MealRecord[]>();

  for (const meal of meals) {
    const label = formatGroupLabel(meal.createdAt);
    const current = groups.get(label) ?? [];
    current.push(meal);
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
  });
}

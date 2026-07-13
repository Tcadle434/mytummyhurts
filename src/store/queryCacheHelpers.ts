import { HomeResponse, LearningRecomputeResponse } from '../services/api/contracts';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  UserProfile,
} from '../types/domain';
import {
  mergeDailyReportByLocalDate,
  sortDailyReportsByDate,
} from '../utils/dailyReports';

export type HistoryQueryCache = {
  pages?: { scans?: { id?: string }[]; [key: string]: unknown }[];
  scans?: { id?: string }[];
  [key: string]: unknown;
};

export function removeScanFromHistoryCache(scanId: string) {
  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as HistoryQueryCache;
    if (Array.isArray(historyCache.pages)) {
      let changed = false;
      const pages = historyCache.pages.map((page) => {
        if (!Array.isArray(page.scans)) {
          return page;
        }

        const scans = page.scans.filter((scan) => scan.id !== scanId);
        if (scans.length === page.scans.length) {
          return page;
        }

        changed = true;
        return { ...page, scans };
      });

      return changed ? { ...historyCache, pages } : cached;
    }

    if (Array.isArray(historyCache.scans)) {
      const scans = historyCache.scans.filter((scan) => scan.id !== scanId);
      return scans.length === historyCache.scans.length ? cached : { ...historyCache, scans };
    }

    return cached;
  });
}

export function patchDisplayNameInInsightsCache(displayName: string | null | undefined) {
  const normalizedDisplayName = displayName?.trim() || undefined;
  queryClient.setQueriesData({ queryKey: queryKeys.insights }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object' || !('profile' in cached)) {
      return cached;
    }

    const response = cached as { profile?: UserProfile | null };
    if (!response.profile) {
      return cached;
    }

    return {
      ...response,
      profile: {
        ...response.profile,
        displayName: normalizedDisplayName,
      },
    };
  });
}

export function patchInsightsCacheFromLearning(response: LearningRecomputeResponse) {
  if (
    typeof response.profile === 'undefined' &&
    typeof response.insights === 'undefined' &&
    typeof response.conditionInsights === 'undefined'
  ) {
    return;
  }

  queryClient.setQueriesData({ queryKey: queryKeys.insights }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const current = cached as {
      profile?: UserProfile | null;
      insights?: IngredientInsight[];
      conditionInsights?: ConditionIngredientInsight[];
      [key: string]: unknown;
    };

    return {
      ...current,
      profile: typeof response.profile === 'undefined' ? current.profile : response.profile,
      insights: response.insights ?? current.insights,
      conditionInsights: response.conditionInsights ?? current.conditionInsights,
    };
  });
}

export function patchDailyReportsInHistoryCache(dailyReports: DailyGutReport[] | undefined) {
  if (!dailyReports) {
    return;
  }

  const orderedReports = sortDailyReportsByDate(dailyReports);

  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as {
      pages?: { dailyReports?: DailyGutReport[]; [key: string]: unknown }[];
      dailyReports?: DailyGutReport[];
      [key: string]: unknown;
    };

    if (Array.isArray(historyCache.pages)) {
      return {
        ...historyCache,
        pages: historyCache.pages.map((page) =>
          Array.isArray(page.dailyReports)
            ? { ...page, dailyReports: orderedReports }
            : page,
        ),
      };
    }

    if (Array.isArray(historyCache.dailyReports)) {
      return {
        ...historyCache,
        dailyReports: orderedReports,
      };
    }

    return cached;
  });
}

export function patchLearningResponseInQueryCaches(response: LearningRecomputeResponse) {
  patchInsightsCacheFromLearning(response);
  patchDailyReportsInHistoryCache(response.dailyReports);
}

export function patchDailyReportInQueryCaches(report: DailyGutReport) {
  queryClient.setQueryData(queryKeys.home, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const homeCache = cached as HomeResponse;
    if (!Array.isArray(homeCache.dailyReports)) {
      return cached;
    }

    return {
      ...homeCache,
      dailyReports: mergeDailyReportByLocalDate(homeCache.dailyReports, report),
    };
  });

  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as {
      pages?: { dailyReports?: DailyGutReport[]; [key: string]: unknown }[];
      dailyReports?: DailyGutReport[];
      [key: string]: unknown;
    };

    if (Array.isArray(historyCache.pages)) {
      return {
        ...historyCache,
        pages: historyCache.pages.map((page) =>
          Array.isArray(page.dailyReports)
            ? { ...page, dailyReports: mergeDailyReportByLocalDate(page.dailyReports, report) }
            : page,
        ),
      };
    }

    if (Array.isArray(historyCache.dailyReports)) {
      return {
        ...historyCache,
        dailyReports: mergeDailyReportByLocalDate(historyCache.dailyReports, report),
      };
    }

    return cached;
  });
}

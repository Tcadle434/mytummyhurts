import { FunctionsHttpError } from '@supabase/supabase-js';

import { requireSupabaseClient } from '../supabase/client';
import { UserProfile } from '../../types/domain';
import {
  AnalyzeImageRequest,
  AnalyzeResponse,
  AnalyzeTextRequest,
  BillingSyncRequest,
  BillingSyncResponse,
  DailyReportUpsertRequest,
  DailyReportUpsertResponse,
  DeleteAccountResponse,
  HistoryRequest,
  HistoryResponse,
  InsightsRequest,
  InsightsResponse,
  NotificationRegistrationRequest,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  ScanDeleteRequest,
  ScanDeleteResponse,
  TokensTopUpRequest,
  TokensTopUpResponse,
} from './contracts';

function normalizeDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function requestedDisplayName(request: ProfileUpdateRequest) {
  if (typeof request.onboardingAnswers?.displayName !== 'undefined') {
    return request.onboardingAnswers.displayName;
  }

  if (typeof request.displayName !== 'undefined') {
    return request.displayName;
  }

  return undefined;
}

function mergeDisplayName(profile: UserProfile | null, displayName: string | null | undefined) {
  if (!profile || typeof displayName === 'undefined') {
    return profile;
  }

  return {
    ...profile,
    displayName: displayName ?? undefined,
  };
}

async function invokeFunction<TResponse>(name: string, body: object): Promise<TResponse> {
  const client = requireSupabaseClient();
  const { data, error } = await client.functions.invoke(name, {
    body,
  });

  if (!error) {
    return data as TResponse;
  }

  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      const message =
        payload?.error?.message ??
        payload?.message ??
        `The ${name} request failed.`;
      throw new Error(message);
    } catch (contextError) {
      if (contextError instanceof Error) {
        throw contextError;
      }
    }
  }

  throw error;
}

async function fetchDisplayName() {
  const client = requireSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return undefined;
  }

  const { data, error } = await client
    .from('user_profiles')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeDisplayName((data as { display_name?: string | null } | null)?.display_name);
}

export const liveApiClient = {
  analyzeImage(request: AnalyzeImageRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-image', request);
  },

  analyzeText(request: AnalyzeTextRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-text', request);
  },

  async deleteScan(request: ScanDeleteRequest) {
    const [response, displayName] = await Promise.all([
      invokeFunction<ScanDeleteResponse>('scan-delete', request),
      fetchDisplayName(),
    ]);
    return {
      ...response,
      profile: mergeDisplayName(response.profile, displayName),
    };
  },

  getHistory(request: HistoryRequest = {}) {
    return invokeFunction<HistoryResponse>('history-get', request);
  },

  async upsertDailyReport(request: DailyReportUpsertRequest) {
    const [response, displayName] = await Promise.all([
      invokeFunction<DailyReportUpsertResponse>('daily-report-upsert', request),
      fetchDisplayName(),
    ]);
    return {
      ...response,
      profile: mergeDisplayName(response.profile, displayName),
    };
  },

  async getInsights(request: InsightsRequest = {}) {
    const [response, displayName] = await Promise.all([
      invokeFunction<InsightsResponse>('insights-get', request),
      fetchDisplayName(),
    ]);
    return {
      ...response,
      profile: mergeDisplayName(response.profile, displayName),
    };
  },

  async updateProfile(request: ProfileUpdateRequest) {
    const response = await invokeFunction<ProfileUpdateResponse>('profile-update', request);
    const displayName = await fetchDisplayName();

    return {
      ...response,
      profile: mergeDisplayName(response.profile, displayName),
    };
  },

  syncBilling(request: BillingSyncRequest) {
    return invokeFunction<BillingSyncResponse>('billing-sync', request);
  },

  topUpTokens(request: TokensTopUpRequest) {
    return invokeFunction<TokensTopUpResponse>('tokens-topup', request);
  },

  registerNotificationToken(request: NotificationRegistrationRequest) {
    return invokeFunction<{ ok: true }>('notifications-register-token', request);
  },

  deleteAccount() {
    return invokeFunction<DeleteAccountResponse>('account-delete', {});
  },
};

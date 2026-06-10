import { FunctionsHttpError } from '@supabase/supabase-js';

import { requireSupabaseClient } from '../supabase/client';
import { UserProfile } from '../../types/domain';
import { ApiError, normalizeRetryableTransportError } from './errors';
import {
  AnalyzeImageRequest,
  AnalyzeBarcodeRequest,
  AnalyzeResponse,
  AnalyzeTextRequest,
  BillingSyncRequest,
  BillingSyncResponse,
  DailyReportUpsertRequest,
  DailyReportUpsertResponse,
  DeleteAccountResponse,
  ExistingAccountCheckRequest,
  ExistingAccountCheckResponse,
  HomeResponse,
  HistoryRequest,
  HistoryResponse,
  InsightsRequest,
  InsightsResponse,
  LearningRecomputeRequest,
  LearningRecomputeResponse,
  NotificationRegistrationRequest,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  ScanGetRequest,
  ScanGetResponse,
  ScanDeleteRequest,
  ScanDeleteResponse,
  TokensTopUpRequest,
  TokensTopUpResponse,
} from './contracts';

export { ApiError } from './errors';

function normalizeDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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
  let response: Awaited<ReturnType<typeof client.functions.invoke>>;

  try {
    response = await client.functions.invoke(name, {
      body,
    });
  } catch (error) {
    throw normalizeRetryableTransportError(error, name) ?? error;
  }

  const { data, error } = response;

  if (!error) {
    return data as TResponse;
  }

  if (error instanceof FunctionsHttpError) {
    let payload: {
      error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
      };
      message?: string;
    } = {};

    try {
      payload = await error.context.json();
    } catch {
      payload = {};
    }

    const message =
      payload?.error?.message ??
      payload?.message ??
      `The ${name} request failed.`;
    throw new ApiError(message, {
      status: error.context.status,
      code: payload?.error?.code,
      details: payload?.error?.details,
    });
  }

  const retryableTransportError = normalizeRetryableTransportError(error, name);
  if (retryableTransportError) {
    throw retryableTransportError;
  }

  throw error;
}

async function fetchDisplayName() {
  const client = requireSupabaseClient();
  let userResponse: Awaited<ReturnType<typeof client.auth.getUser>>;

  try {
    userResponse = await client.auth.getUser();
  } catch (error) {
    throw normalizeRetryableTransportError(error, 'auth.getUser') ?? error;
  }

  const {
    data: { user },
    error: userError,
  } = userResponse;

  if (userError) {
    throw normalizeRetryableTransportError(userError, 'auth.getUser') ?? userError;
  }

  if (!user) {
    return undefined;
  }

  let displayNameResponse: { data: unknown; error: unknown };

  try {
    displayNameResponse = await client
      .from('user_profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle();
  } catch (error) {
    throw normalizeRetryableTransportError(error, 'user_profiles.display_name') ?? error;
  }

  const { data, error } = displayNameResponse;

  if (error) {
    throw normalizeRetryableTransportError(error, 'user_profiles.display_name') ?? error;
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

  analyzeBarcode(request: AnalyzeBarcodeRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-barcode', request);
  },

  async deleteScan(request: ScanDeleteRequest) {
    return invokeFunction<ScanDeleteResponse>('scan-delete', request);
  },

  getHistory(request: HistoryRequest = {}) {
    return invokeFunction<HistoryResponse>('history-get', request);
  },

  getHome() {
    return invokeFunction<HomeResponse>('home-get', {});
  },

  getScan(request: ScanGetRequest) {
    return invokeFunction<ScanGetResponse>('scan-get', request);
  },

  upsertDailyReport(request: DailyReportUpsertRequest) {
    return invokeFunction<DailyReportUpsertResponse>('daily-report-upsert', request);
  },

  async learningRecompute(request: LearningRecomputeRequest) {
    const [response, displayName] = await Promise.all([
      invokeFunction<LearningRecomputeResponse>('learning-recompute', request),
      fetchDisplayName(),
    ]);
    return {
      ...response,
      profile: mergeDisplayName(response.profile ?? null, displayName),
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
    return invokeFunction<ProfileUpdateResponse>('profile-update', request);
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

  checkExistingAccount(request: ExistingAccountCheckRequest = {}) {
    return invokeFunction<ExistingAccountCheckResponse>('auth-existing-account-check', request);
  },
};

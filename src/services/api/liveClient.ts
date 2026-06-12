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
  ScanConsumptionUpdateRequest,
  ScanConsumptionUpdateResponse,
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

let homeGetInFlight: Promise<HomeResponse> | null = null;

// Edge calls ride a raw fetch with no deadline; if the connection dies while
// the app is backgrounded the promise never settles and anything gated on it
// (sync flags, toasts) sticks forever. Race every invoke against a timeout.
const DEFAULT_INVOKE_TIMEOUT_MS = 45_000;

function invokeTimeout(name: string, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(`The ${name} request timed out. Please try again.`, {
          code: 'request_timeout',
          details: { functionName: name, timeoutMs },
        }),
      );
    }, timeoutMs);
  });
  return { promise, clear: () => clearTimeout(timer) };
}

async function invokeFunction<TResponse>(
  name: string,
  body: object,
  options: { timeoutMs?: number } = {},
): Promise<TResponse> {
  const client = requireSupabaseClient();
  const startedAt = Date.now();
  const timeout = invokeTimeout(name, options.timeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS);
  let response: Awaited<ReturnType<typeof client.functions.invoke>>;

  try {
    response = await Promise.race([
      client.functions.invoke(name, {
        body,
      }),
      timeout.promise,
    ]);
  } catch (error) {
    throw normalizeRetryableTransportError(error, name) ?? error;
  } finally {
    timeout.clear();
    if (__DEV__) {
      console.log(`[api] ${name} ${Date.now() - startedAt}ms`);
    }
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
    return invokeFunction<AnalyzeResponse>('scan-analyze-image', request, { timeoutMs: 300_000 });
  },

  analyzeText(request: AnalyzeTextRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-text', request, { timeoutMs: 300_000 });
  },

  analyzeBarcode(request: AnalyzeBarcodeRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-barcode', request, { timeoutMs: 300_000 });
  },

  async deleteScan(request: ScanDeleteRequest) {
    return invokeFunction<ScanDeleteResponse>('scan-delete', request);
  },

  async updateScanConsumption(request: ScanConsumptionUpdateRequest) {
    return invokeFunction<ScanConsumptionUpdateResponse>('scan-consumption-update', request);
  },

  getHistory(request: HistoryRequest = {}) {
    return invokeFunction<HistoryResponse>('history-get', request);
  },

  getHome() {
    // App launch fires home-get from several places at once (query hook,
    // bootstrap refresh, snapshot poll). Collapse concurrent callers into one
    // request — on a cold function this turns 4 stacked calls into 1.
    if (!homeGetInFlight) {
      homeGetInFlight = invokeFunction<HomeResponse>('home-get', {}).finally(() => {
        homeGetInFlight = null;
      });
    }
    return homeGetInFlight;
  },

  getScan(request: ScanGetRequest) {
    return invokeFunction<ScanGetResponse>('scan-get', request);
  },

  upsertDailyReport(request: DailyReportUpsertRequest) {
    return invokeFunction<DailyReportUpsertResponse>('daily-report-upsert', request);
  },

  async learningRecompute(request: LearningRecomputeRequest) {
    const [response, displayName] = await Promise.all([
      invokeFunction<LearningRecomputeResponse>('learning-recompute', request, { timeoutMs: 120_000 }),
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

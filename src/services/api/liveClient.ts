import { env } from '../../config/env';
import { getNestAccessToken } from '../auth/nestSession';
import { ApiError, normalizeRetryableTransportError } from './errors';
import {
  AnalyzeImageRequest,
  AnalyzeBarcodeRequest,
  AnalyzeResponse,
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
  ScanProgressRequest,
  ScanProgressResponse,
  TokensTopUpRequest,
  TokensTopUpResponse,
  ScanConsumptionUpdateRequest,
  ScanConsumptionUpdateResponse,
} from './contracts';

export { ApiError } from './errors';

let homeGetInFlight: Promise<HomeResponse> | null = null;

// A dead connection (e.g. app backgrounded mid-request) must not leave the
// promise hanging forever — anything gated on it (sync flags, toasts) would
// stick. Abort every request against a deadline.
const DEFAULT_INVOKE_TIMEOUT_MS = 45_000;

// Self-hosted NestJS transport: the endpoint name maps 1:1 to POST /v1/<name>,
// carrying the access token (auto-refreshed by nestSession).
async function invokeFunction<TResponse>(
  name: string,
  body: object,
  options: { timeoutMs?: number } = {},
): Promise<TResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_INVOKE_TIMEOUT_MS;
  const token = await getNestAccessToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.apiUrl.replace(/\/$/, '')}/v1/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    if (!res.ok) {
      throw new ApiError(json?.error?.message ?? `The ${name} request failed.`, {
        status: res.status,
        code: json?.error?.code,
        details: json?.error?.details,
      });
    }
    return json as TResponse;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError(`The ${name} request timed out. Please try again.`, {
        code: 'request_timeout',
        details: { functionName: name, timeoutMs },
      });
    }
    throw normalizeRetryableTransportError(error, name) ?? error;
  } finally {
    clearTimeout(timer);
  }
}

export const liveApiClient = {
  analyzeImage(request: AnalyzeImageRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-image', request, { timeoutMs: 300_000 });
  },

  analyzeBarcode(request: AnalyzeBarcodeRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-barcode', request, { timeoutMs: 300_000 });
  },

  getScanProgress(request: ScanProgressRequest) {
    // Display-only poll while an analyze request is in flight — keep the
    // timeout short so a slow poll never outlives the next tick by much.
    return invokeFunction<ScanProgressResponse>('scan-progress', request, { timeoutMs: 10_000 });
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
    // bootstrap refresh, snapshot poll). Collapse concurrent callers into one.
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
    // The server includes profile.displayName directly in the response.
    return invokeFunction<LearningRecomputeResponse>('learning-recompute', request, { timeoutMs: 120_000 });
  },

  async getInsights(request: InsightsRequest = {}) {
    return invokeFunction<InsightsResponse>('insights-get', request);
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

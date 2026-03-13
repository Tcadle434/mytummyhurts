import { FunctionsHttpError } from '@supabase/supabase-js';

import { requireSupabaseClient } from '../supabase/client';
import {
  AnalyzeImageRequest,
  AnalyzeResponse,
  AnalyzeTextRequest,
  BillingSyncRequest,
  BillingSyncResponse,
  DeleteAccountResponse,
  HistoryRequest,
  HistoryResponse,
  InsightsRequest,
  InsightsResponse,
  MealResponse,
  MealResponseRequest,
  MealSymptomsRequest,
  MealSymptomsResponse,
  NotificationRegistrationRequest,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  TokensTopUpRequest,
  TokensTopUpResponse,
} from './contracts';

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

export const liveApiClient = {
  analyzeImage(request: AnalyzeImageRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-image', request);
  },

  analyzeText(request: AnalyzeTextRequest) {
    return invokeFunction<AnalyzeResponse>('scan-analyze-text', request);
  },

  respondEaten(request: MealResponseRequest) {
    return invokeFunction<MealResponse>('meal-respond-eaten', request);
  },

  logSymptoms(request: MealSymptomsRequest) {
    return invokeFunction<MealSymptomsResponse>('meal-log-symptoms', request);
  },

  getHistory(request: HistoryRequest = {}) {
    return invokeFunction<HistoryResponse>('history-get', request);
  },

  getInsights(request: InsightsRequest = {}) {
    return invokeFunction<InsightsResponse>('insights-get', request);
  },

  updateProfile(request: ProfileUpdateRequest) {
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
};

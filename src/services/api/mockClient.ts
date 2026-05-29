import { useAppStore } from '../../store/useAppStore';
import {
  AnalyzeImageRequest,
  AnalyzeBarcodeRequest,
  AnalyzeResponse,
  AnalyzeTextRequest,
  BillingSyncRequest,
  DeleteAccountResponse,
  ExistingAccountCheckRequest,
  ExistingAccountCheckResponse,
  HistoryRequest,
  HistoryResponse,
  InsightsRequest,
  InsightsResponse,
  DailyReportUpsertRequest,
  LearningRecomputeRequest,
  NotificationRegistrationRequest,
  ProfileUpdateRequest,
  ScanDeleteRequest,
  TokensTopUpRequest,
} from './contracts';
import { ScanRecord } from '../../types/domain';

function scanHistorySummary(scan: ScanRecord) {
  return {
    id: scan.id,
    requestId: scan.requestId,
    sourceType: scan.sourceType,
    scanCategory: scan.scanCategory,
    analysisStatus: scan.analysisStatus,
    tokenCost: scan.tokenCost,
    createdAt: scan.createdAt,
    completedAt: scan.completedAt,
    localDate: scan.localDate,
    timezone: scan.timezone,
    dishName: scan.dishName,
    overallRiskScore: scan.overallRiskScore,
    overallRiskLevel: scan.overallRiskLevel,
    imageUri: scan.imageUri,
  };
}

export const mockApiClient = {
  async analyzeImage(request: AnalyzeImageRequest): Promise<AnalyzeResponse> {
    const result = await useAppStore.getState().analyzeScanInput({
      requestId: request.requestId,
      sourceType: request.sourceType,
      imageUri: request.imagePath,
      imageUris: request.imagePaths,
      imageDataUrl: request.imageDataUrl,
      imageDataUrls: request.imageDataUrls,
      scanCategory: request.scanCategory,
      localDate: request.localDate,
      timezone: request.timezone,
    });
    const state = useAppStore.getState();
    const scan = state.scans.find((entry) => entry.id === result.scanId)!;
    return {
      scanId: result.scanId,
      tokensRemaining: state.billing.tokensRemaining,
      scan,
      billing: state.billing,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
    };
  },

  async analyzeText(request: AnalyzeTextRequest): Promise<AnalyzeResponse> {
    const result = await useAppStore.getState().analyzeScanInput({
      requestId: request.requestId,
      sourceType: request.sourceType,
      text: request.text,
      scanCategory: request.scanCategory,
      localDate: request.localDate,
      timezone: request.timezone,
    });
    const state = useAppStore.getState();
    const scan = state.scans.find((entry) => entry.id === result.scanId)!;
    return {
      scanId: result.scanId,
      tokensRemaining: state.billing.tokensRemaining,
      scan,
      billing: state.billing,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
    };
  },

  async analyzeBarcode(request: AnalyzeBarcodeRequest): Promise<AnalyzeResponse> {
    const result = await useAppStore.getState().analyzeScanInput({
      requestId: request.requestId,
      sourceType: request.sourceType,
      barcode: request.barcode,
      scanCategory: request.scanCategory ?? 'grocery',
      localDate: request.localDate,
      timezone: request.timezone,
    });
    const state = useAppStore.getState();
    const scan = state.scans.find((entry) => entry.id === result.scanId)!;
    return {
      scanId: result.scanId,
      tokensRemaining: state.billing.tokensRemaining,
      scan,
      billing: state.billing,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
    };
  },

  async deleteScan(request: ScanDeleteRequest) {
    await useAppStore.getState().deleteScanRecord(request.scanId);
    const state = useAppStore.getState();
    return {
      ok: true as const,
      scanId: request.scanId,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
    };
  },

  async getHistory(request: HistoryRequest = {}): Promise<HistoryResponse> {
    const state = useAppStore.getState();
    const page = request.page ?? 1;
    const pageSize = request.pageSize ?? state.scans.length;
    const start = (page - 1) * pageSize;
    const scans = state.scans.slice(start, start + pageSize);
    return {
      page,
      pageSize,
      hasMore: start + pageSize < state.scans.length,
      scans: scans.map(scanHistorySummary),
      dailyReports: request.includeDailyReports === false ? undefined : state.dailyReports,
    };
  },

  async getScan(request: { scanId: string }) {
    const scan = useAppStore.getState().scans.find((entry) => entry.id === request.scanId);
    if (!scan) {
      throw new Error('Scan not found.');
    }

    return {
      ok: true as const,
      scan,
    };
  },

  async upsertDailyReport(request: DailyReportUpsertRequest) {
    await useAppStore.getState().upsertDailyReport(request);
    const state = useAppStore.getState();
    const report = state.dailyReports.find((entry) => entry.localDate === request.localDate)!;
    return {
      ok: true as const,
      report,
      learningSyncStatus: 'skipped' as const,
    };
  },

  async learningRecompute(_request: LearningRecomputeRequest) {
    const state = useAppStore.getState();
    return {
      ok: true as const,
      learningSyncStatus: 'updated' as const,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
      dailyReports: state.dailyReports,
    };
  },

  async getInsights(_request: InsightsRequest = {}): Promise<InsightsResponse> {
    const state = useAppStore.getState();
    return {
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
      billing: state.billing,
    };
  },

  async updateProfile(request: ProfileUpdateRequest) {
    await useAppStore.getState().updateProfileSettings(request);
    const state = useAppStore.getState();
    return {
      ok: true as const,
      profile: state.profile,
      insights: state.insights,
      conditionInsights: state.conditionInsights,
      billing: state.billing,
    };
  },

  async syncBilling(request: BillingSyncRequest) {
    const state = useAppStore.getState();
    const subscriptionStatus = request.status === 'in_grace' ? 'active' : request.status;
    const billing = {
      ...state.billing,
      selectedPlan: request.planCode ?? state.billing.selectedPlan,
      subscriptionStatus: subscriptionStatus ?? state.billing.subscriptionStatus,
      trialEndsAt: request.trialEndsAt ?? state.billing.trialEndsAt,
      renewalAt: request.renewalAt ?? state.billing.renewalAt,
      monthlyAllowance: request.monthlyAllowance ?? state.billing.monthlyAllowance,
    };
    useAppStore.getState().applyBillingState(billing);
    return {
      ok: true as const,
      billing,
    };
  },

  async topUpTokens(_request: TokensTopUpRequest) {
    const state = useAppStore.getState();
    const billing = {
      ...state.billing,
      tokensRemaining: state.billing.tokensRemaining + 10,
    };
    useAppStore.getState().applyBillingState(billing);
    return {
      ok: true as const,
      billing,
    };
  },

  async registerNotificationToken(_request: NotificationRegistrationRequest) {
    return { ok: true as const };
  },

  async deleteAccount(): Promise<DeleteAccountResponse> {
    useAppStore.getState().signOut();
    return { ok: true };
  },

  async checkExistingAccount(_request: ExistingAccountCheckRequest = {}): Promise<ExistingAccountCheckResponse> {
    const state = useAppStore.getState();
    const profile = state.profile;
    const hasProfile =
      Boolean(profile?.knownConditions.length) ||
      Boolean(profile?.knownIngredientSensitivities.length) ||
      Boolean(profile?.commonSymptoms.length) ||
      Boolean(profile?.symptomFrequency) ||
      Boolean(profile?.symptomSeverityBaseline);
    const hasEntitlement = state.billing.subscriptionStatus === 'trialing' || state.billing.subscriptionStatus === 'active';

    return {
      ok: true,
      allowed: hasEntitlement && hasProfile,
      reason: hasEntitlement ? 'incomplete_profile' : 'missing_entitlement',
    };
  },
};

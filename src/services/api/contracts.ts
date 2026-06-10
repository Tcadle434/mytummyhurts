import {
  BillingState,
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  ScanHistorySummary,
  ScanInputPayload,
  ScanRecord,
  DietPreference,
  DietPreferenceKey,
  UserProfile,
} from '../../types/domain';

export interface AnalyzeImageRequest {
  requestId: string;
  imagePath?: string;
  imagePaths?: string[];
  thumbnailImagePaths?: (string | null)[];
  imageDataUrl?: string;
  imageDataUrls?: string[];
  sourceType: ScanInputPayload['sourceType'];
  scanCategory?: ScanInputPayload['scanCategory'];
  localDate?: string;
  timezone?: string;
}

export interface AnalyzeTextRequest {
  requestId: string;
  text: string;
  sourceType: ScanInputPayload['sourceType'];
  scanCategory?: ScanInputPayload['scanCategory'];
  localDate?: string;
  timezone?: string;
}

export interface AnalyzeBarcodeRequest {
  requestId: string;
  barcode: string;
  sourceType: ScanInputPayload['sourceType'];
  scanCategory?: ScanInputPayload['scanCategory'];
  localDate?: string;
  timezone?: string;
}

export interface AnalyzeResponse {
  scanId: string;
  requestId?: string;
  deduped?: boolean;
  learningSyncStatus?: 'updated' | 'locked' | 'failed' | 'queued' | 'skipped' | 'not_applicable';
  tokensRemaining: number;
  scan: ScanRecord;
  billing: BillingState;
  profile?: UserProfile | null;
  insights?: IngredientInsight[];
  conditionInsights?: ConditionIngredientInsight[];
}

export interface ScanDeleteRequest {
  scanId: string;
}

export interface ScanDeleteResponse {
  ok: true;
  scanId: string;
  profile?: UserProfile | null;
  insights?: IngredientInsight[];
  conditionInsights?: ConditionIngredientInsight[];
  learningSyncStatus?: 'queued' | 'failed';
}

export interface ScanGetRequest {
  scanId: string;
}

export interface ScanGetResponse {
  ok: true;
  scan: ScanRecord;
}

export interface DailyReportUpsertRequest {
  localDate: string;
  gutSeverity: number;
  symptomTags?: string[];
  notes?: string;
}

export interface DailyReportUpsertResponse {
  ok: true;
  report: DailyGutReport;
  learningSyncStatus: 'queued' | 'failed' | 'skipped';
}

export interface LearningRecomputeRequest {
  sourceType: 'daily_gut_report' | 'scan' | 'profile';
  sourceId?: string;
  eventType?: string;
}

export interface LearningRecomputeResponse {
  ok: true;
  learningSyncStatus: 'updated' | 'locked' | 'failed';
  profile?: UserProfile | null;
  insights?: IngredientInsight[];
  conditionInsights?: ConditionIngredientInsight[];
  dailyReports?: DailyGutReport[];
}

export interface HistoryRequest {
  page?: number;
  pageSize?: number;
  includeDailyReports?: boolean;
  scanCategory?: 'food' | 'menu' | 'grocery';
}

export interface HistoryResponse {
  page: number;
  pageSize: number;
  hasMore: boolean;
  scans: ScanHistorySummary[];
  dailyReports?: DailyGutReport[];
}

export interface InsightsRequest {
  search?: string;
  limit?: number;
}

export interface InsightsResponse {
  profile: UserProfile | null;
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
  billing: BillingState;
}

export type HomeLearningStatus = 'idle' | 'pending' | 'running' | 'failed';

export interface HomeResponse {
  ok: true;
  snapshotVersion: number;
  profile: UserProfile | null;
  billing: BillingState;
  recentScans: ScanHistorySummary[];
  dailyReports: DailyGutReport[];
  insightSummary: {
    triggers: IngredientInsight[];
    safeFoods: IngredientInsight[];
    conditionInsights: ConditionIngredientInsight[];
  };
  learningStatus: HomeLearningStatus;
  generatedAt: string;
  serverTime: string;
}

export interface ProfileUpdateRequest {
  onboardingAnswers?: {
    displayName?: string | null;
    conditions?: string[];
    customConditions?: string[];
    ingredientSensitivities?: string[];
    customIngredientSensitivities?: string[];
    symptoms?: string[];
    customSymptoms?: string[];
    symptomFrequency?: string;
    symptomSeverityBaseline?: string;
    mealContexts?: string[];
    motivation?: string;
    currentEatingPatterns?: string[];
    lifestyleFactors?: string[];
    favoriteFoodsToReintroduce?: string;
    dietPreferenceKeys?: DietPreferenceKey[];
  };
  displayName?: string | null;
  knownConditions?: string[];
  knownIngredientSensitivities?: string[];
  commonSymptoms?: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts?: string[];
  motivation?: string;
  currentEatingPatterns?: string[];
  lifestyleFactors?: string[];
  foodsToReintroduce?: string[];
  dietPreferences?: DietPreference[];
}

export interface ProfileUpdateResponse {
  ok: true;
  profile?: UserProfile | null;
  insights?: IngredientInsight[];
  conditionInsights?: ConditionIngredientInsight[];
  billing?: BillingState;
  displayName?: string | null;
  learningSyncStatus?: 'queued' | 'failed' | 'skipped';
}

export interface BillingSyncRequest {
  planCode?: 'monthly' | 'annual';
  status?: BillingState['subscriptionStatus'] | 'in_grace';
  trialEndsAt?: string;
  currentPeriodStart?: string;
  renewalAt?: string;
  provider?: string;
  providerSubscriptionId?: string;
  monthlyAllowance?: number;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
}

export interface BillingSyncResponse {
  ok: true;
  billing: BillingState;
}

export interface TokensTopUpRequest {
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
}

export interface TokensTopUpResponse {
  ok: true;
  billing: BillingState;
}

export interface NotificationRegistrationRequest {
  pushToken: string;
  platform?: 'ios';
}

export interface DeleteAccountResponse {
  ok: true;
}

export interface ExistingAccountCheckRequest {
  cleanupFreshUnentitledUser?: boolean;
}

export interface ExistingAccountCheckResponse {
  ok: true;
  allowed: boolean;
  reason?: 'missing_entitlement' | 'incomplete_profile' | 'fresh_orphan_deleted' | 'not_found';
  deletedOrphan?: boolean;
}

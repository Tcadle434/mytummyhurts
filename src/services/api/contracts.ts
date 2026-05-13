import {
  BillingState,
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  ScanCategory,
  ScanInputPayload,
  ScanRecord,
  UserProfile,
} from '../../types/domain';

export interface AnalyzeImageRequest {
  imagePath: string;
  sourceType: ScanInputPayload['sourceType'];
  scanCategory?: ScanCategory;
  localDate?: string;
  timezone?: string;
}

export interface AnalyzeTextRequest {
  text: string;
  sourceType: ScanInputPayload['sourceType'];
  scanCategory?: ScanCategory;
  localDate?: string;
  timezone?: string;
}

export interface AnalyzeResponse {
  scanId: string;
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
  profile: UserProfile | null;
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
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
  profile: UserProfile | null;
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
}

export interface HistoryRequest {
  page?: number;
  pageSize?: number;
}

export interface HistoryResponse {
  page: number;
  pageSize: number;
  hasMore: boolean;
  scans: ScanRecord[];
  dailyReports: DailyGutReport[];
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
}

export interface ProfileUpdateResponse {
  ok: true;
  profile: UserProfile | null;
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
  billing: BillingState;
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

import {
  BillingState,
  EatenTimeBucket,
  IngredientInsight,
  MealRecord,
  MealSymptomRecord,
  ScanInputPayload,
  ScanRecord,
  ScanResult,
  UserProfile,
} from '../../types/domain';

export interface AnalyzeImageRequest {
  imagePath: string;
  sourceType: ScanInputPayload['sourceType'];
}

export interface AnalyzeTextRequest {
  text: string;
  sourceType: ScanInputPayload['sourceType'];
}

export interface AnalyzeResponse {
  scanId: string;
  mealId: string;
  tokensRemaining: number;
  scan: ScanRecord;
  meal: MealRecord;
  billing: BillingState;
}

export interface MealResponseRequest {
  mealId: string;
  didUserEat: boolean;
}

export interface MealResponse {
  ok: true;
  meal: MealRecord;
}

export interface MealSymptomsRequest {
  mealId: string;
  severity: MealSymptomRecord['severity'];
  symptomTags: string[];
  otherText?: string;
  eatenTimeBucket?: EatenTimeBucket;
}

export interface MealSymptomsResponse {
  ok: true;
  meal: MealRecord;
  profile: UserProfile | null;
  insights: IngredientInsight[];
}

export interface HistoryRequest {
  page?: number;
  pageSize?: number;
}

export interface HistoryResponse {
  page: number;
  pageSize: number;
  hasMore: boolean;
  pendingMeals: MealRecord[];
  recentMeals: MealRecord[];
  scans: ScanRecord[];
}

export interface InsightsRequest {
  search?: string;
  limit?: number;
}

export interface InsightsResponse {
  profile: UserProfile | null;
  insights: IngredientInsight[];
  billing: BillingState;
}

export interface ProfileUpdateRequest {
  onboardingAnswers?: {
    conditions?: string[];
    customConditions?: string[];
    ingredientSensitivities?: string[];
    customIngredientSensitivities?: string[];
    symptoms?: string[];
    symptomFrequency?: string;
    symptomSeverityBaseline?: string;
    mealContexts?: string[];
    motivation?: string;
  };
  knownConditions?: string[];
  knownIngredientSensitivities?: string[];
  commonSymptoms?: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts?: string[];
  motivation?: string;
}

export interface ProfileUpdateResponse {
  ok: true;
  profile: UserProfile | null;
  insights: IngredientInsight[];
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

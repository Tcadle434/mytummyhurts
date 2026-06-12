import { topUpOptions } from '../data/catalog';
import { HomeResponse, LearningRecomputeRequest, ProfileUpdateRequest } from '../services/api/contracts';
import { type ReportPayoffBaseline } from '../features/home/reportPayoff';
import { AppUser, BillingState, ConditionIngredientInsight, DailyGutReport, IngredientInsight, OnboardingAnswers, OnboardingStage, ScanInputPayload, ScanRecord, SubscriptionPlan, UserProfile } from '../types/domain';

export type AppStoreState = {
  onboardingStage: OnboardingStage;
  onboardingStepIndex: number;
  onboardingAnswers: OnboardingAnswers;
  authUser: AppUser | null;
  profile: UserProfile | null;
  billing: BillingState;
  scans: ScanRecord[];
  dailyReports: DailyGutReport[];
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
  serverSyncError: string | null;
  learningSyncInFlight: boolean;
  learningSyncRequestId: string | null;
  learningSyncError: string | null;
  learningSyncSource: 'daily_report' | 'recompute' | null;
  remoteDataLoaded: boolean;
  reportPayoffBaseline: ReportPayoffBaseline | null;
  clearReportPayoffBaseline: () => void;
  cacheScanRecord: (scan: ScanRecord) => void;
  updateOnboardingField: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void;
  toggleOnboardingValue: (
    field:
      | 'conditions'
      | 'ingredientSensitivities'
      | 'symptoms'
      | 'mealContexts'
      | 'motivations'
      | 'currentEatingPatterns'
      | 'lifestyleFactors'
      | 'dietPreferenceKeys',
    value: string,
  ) => void;
  addCustomOnboardingValue: (field: 'customConditions' | 'customIngredientSensitivities' | 'customSymptoms', value: string) => void;
  removeCustomOnboardingValue: (field: 'customConditions' | 'customIngredientSensitivities' | 'customSymptoms', value: string) => void;
  setOnboardingStepIndex: (index: number) => void;
  setOnboardingStage: (stage: OnboardingStage) => void;
  selectPlan: (plan: SubscriptionPlan) => void;
  stageEntitlementAccess: (status: BillingState['subscriptionStatus']) => void;
  completeAuthSetup: () => Promise<void>;
  syncAuthUser: (user: AppUser) => void;
  refreshRemoteState: () => Promise<void>;
  syncInitialAccountState: () => Promise<void>;
  triggerLearningRecompute: (request: LearningRecomputeRequest) => void;
  updateProfileSettings: (request: ProfileUpdateRequest) => Promise<void>;
  applyBillingState: (billing: BillingState) => void;
  applyHomeResponse: (response: HomeResponse) => void;
  analyzeScanInput: (payload: ScanInputPayload) => Promise<{ scanId: string }>;
  deleteScanRecord: (scanId: string) => Promise<void>;
  upsertDailyReport: (params: {
    localDate: string;
    gutSeverity: number;
    symptomTags?: string[];
    notes?: string;
    evidenceQuality?: 'typical' | 'unscanned';
  }) => Promise<void>;
  updateScanConsumption: (params: {
    scanId: string;
    consumptionStatus?: 'unknown' | 'consumed' | 'skipped';
    consumedMenuItemSourceIds?: string[];
  }) => Promise<void>;
  purchaseTopUp: (tokens: number) => Promise<void>;
  signOut: () => void;
};

export type AppStoreSet = (
  partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>),
) => void;
export type AppStoreGet = () => AppStoreState;

export const defaultBillingState: BillingState = {
  selectedPlan: 'annual',
  subscriptionStatus: 'none',
  tokensRemaining: 40,
  monthlyAllowance: 40,
  topUpOptions,
};

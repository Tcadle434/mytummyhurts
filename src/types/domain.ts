import type {
  RiskLevel,
  PatternStrength,
  EvidenceCitation,
  // gut-score
  GutScorePhase,
  GutScoreConfidenceLevel,
  GutScoreTrendDirection,
  GutScoreComponents,
  ScoreDriver,
  GutScoreDriver,
  DailyScoreComponents,
  DailyScoreDriver,
  GutScoreHistoryPoint,
  GutScoreEvent,
  GutScoreState,
  GutScoreImpact,
  // profile / diet / insights / taxonomy
  IngredientConfidence,
  InsightConfidenceLevel,
  ProfileLearningStage,
  ProfileConfidenceLevel,
  FoodCalibrationRating,
  DietPreferenceKey,
  DietFitStatus,
  InsightSourceBreakdown,
  ProfileLearningSignal,
  ProfileLearningEvent,
  StomachProfileIngredientScore,
  StomachProfile,
  DietPreference,
  UserProfile,
  DietFitHypothesis,
  DietEvaluation,
  DigestivePatternKey,
  TrackedFoodFamilyKey,
  IngredientTaxonomyConfidence,
  IngredientTaxonomySource,
  IngredientTaxonomyClassification,
  IngredientInsight,
  ConditionIngredientInsight,
  DailyGutReport,
  // menu
  MenuBaseFoodCategoryKey,
  MenuRiskModifierKey,
  MenuRubricEvidence,
  MenuBaseFoodCategory,
  MenuRiskModifier,
  MenuRecommendation,
  MenuRecommendationTier,
  ScoreContributorEvidence,
  ScoreContributor,
  // scan
  ScanSourceType,
  ScanCategory,
  AnalysisStatus,
  IngredientEvidence,
  ExtractionClarity,
  ExtractionImageDetail,
  StructuredIngredient,
  MealComponent,
  IngredientRole,
  IngredientProminence,
  IngredientAmountEstimate,
  ConsumptionPortion,
  ScanDayLoad,
  ExtractedIngredient,
  ConditionSeverityBand,
  ConditionSeverity,
  RiskAdjudicationMetadata,
  MechanismExposure,
  PersonalMechanismAdjustment,
  ConditionRisk,
  ScanConditionRisk,
  ScanIngredientPersonalHistoryMatchType,
  ScanIngredientPersonalHistoryRiskLevel,
  ScanIngredientPersonalHistory,
  ScanIngredientRisk,
  ScanMenuItemResult,
  MenuScanResult,
  GroceryProductSummary,
  ScanHistorySummary,
} from '@mth/shared-domain';

export type {
  RiskLevel,
  PatternStrength,
  EvidenceCitation,
  GutScorePhase,
  GutScoreConfidenceLevel,
  GutScoreTrendDirection,
  GutScoreComponents,
  ScoreDriver,
  GutScoreDriver,
  DailyScoreComponents,
  DailyScoreDriver,
  GutScoreHistoryPoint,
  GutScoreEvent,
  GutScoreState,
  GutScoreImpact,
  IngredientConfidence,
  InsightConfidenceLevel,
  ProfileLearningStage,
  ProfileConfidenceLevel,
  FoodCalibrationRating,
  DietPreferenceKey,
  DietFitStatus,
  InsightSourceBreakdown,
  ProfileLearningSignal,
  ProfileLearningEvent,
  StomachProfileIngredientScore,
  StomachProfile,
  DietPreference,
  UserProfile,
  DietFitHypothesis,
  DietEvaluation,
  DigestivePatternKey,
  TrackedFoodFamilyKey,
  IngredientTaxonomyConfidence,
  IngredientTaxonomySource,
  IngredientTaxonomyClassification,
  IngredientInsight,
  ConditionIngredientInsight,
  DailyGutReport,
  MenuBaseFoodCategoryKey,
  MenuRiskModifierKey,
  MenuRubricEvidence,
  MenuBaseFoodCategory,
  MenuRiskModifier,
  MenuRecommendation,
  MenuRecommendationTier,
  ScoreContributorEvidence,
  ScoreContributor,
  ScanSourceType,
  ScanCategory,
  AnalysisStatus,
  IngredientEvidence,
  ExtractionClarity,
  ExtractionImageDetail,
  StructuredIngredient,
  MealComponent,
  IngredientRole,
  IngredientProminence,
  IngredientAmountEstimate,
  ConsumptionPortion,
  ScanDayLoad,
  ExtractedIngredient,
  ConditionSeverityBand,
  ConditionSeverity,
  RiskAdjudicationMetadata,
  MechanismExposure,
  PersonalMechanismAdjustment,
  ConditionRisk,
  ScanConditionRisk,
  ScanIngredientPersonalHistoryMatchType,
  ScanIngredientPersonalHistoryRiskLevel,
  ScanIngredientPersonalHistory,
  ScanIngredientRisk,
  ScanMenuItemResult,
  MenuScanResult,
  GroceryProductSummary,
  ScanHistorySummary,
};

// ---------------------------------------------------------------------------
// App-specific (Expo / FE-only) domain types. These reference FE-only concepts
// (auth, billing, onboarding flow) and are NOT shared with the server.
// ---------------------------------------------------------------------------
export type ScanInputCategory = ScanCategory;
export type AuthProvider = 'apple' | 'google' | 'email';
export type SubscriptionPlan = 'monthly' | 'annual';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'expired' | 'canceled' | 'in_grace';
export type OnboardingStage = 'intro' | 'flow' | 'paywall' | 'auth' | 'complete';
export type OnboardingStepType =
  | 'message'
  | 'preview'
  | 'multi_select'
  | 'single_select'
  | 'text_input'
  | 'calibration'
  | 'summary';
export type OnboardingCenterImage = 'gutIssuesDiagram';
export type OnboardingCenterGraphic =
  | 'empathyProblem'
  | 'healingPromise'
  | 'gutScoreScale'
  | 'dailyScoreCard'
  | 'healingLoopDiagram'
  | 'phaseDiscovery'
  | 'phaseLimitation'
  | 'phaseReintroduction'
  | 'scannerModesOverview'
  | 'foodControlIntro'
  | 'foodLeverComparison'
  | 'personalGutPromise';

export interface AppUser {
  id: string;
  email: string;
  provider: AuthProvider;
  createdAt: string;
}

export interface OnboardingAnswers {
  displayName: string;
  conditions: string[];
  customConditions: string[];
  ingredientSensitivities: string[];
  customIngredientSensitivities: string[];
  ingredientSensitivitiesUnknown?: boolean;
  foodCalibrations: Record<string, FoodCalibrationRating>;
  lastBadMealText: string;
  symptoms: string[];
  customSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  triedOtherGutHealthApps?: string;
  motivation?: string;
  motivations: string[];
  currentEatingPatterns: string[];
  lifestyleFactors: string[];
  favoriteFoodsToReintroduce: string;
  dietPreferenceKeys: DietPreferenceKey[];
  dietPreferenceNone?: boolean;
}

// ---------------------------------------------------------------------------
// StructuredAnalysisV2 / MenuScanAnalysis / MenuItemAnalysis / ScanResult /
// ScanRecord: kept local because the server's MenuItemAnalysis carries an extra
// scoring-internal field (componentRoles), so this graph is not byte-identical
// across the two apps. They reference the re-exported shared types above.
// ---------------------------------------------------------------------------
export interface StructuredAnalysisV2 {
  dishName: string;
  dishConfidence: IngredientConfidence;
  clarity: ExtractionClarity;
  unclearReason?: string;
  components: MealComponent[];
  visibleIngredients: ExtractedIngredient[];
  inferredIngredients: ExtractedIngredient[];
  prepStyle: string[];
  notes: string[];
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  conditionSeverities?: ConditionSeverity[];
  dietFitHypotheses?: DietFitHypothesis[];
  scoreContributors?: ScoreContributor[];
  scoringConfidence?: IngredientConfidence;
  gutRecommendation?: string;
  rubricVersion?: string;
  riskAdjudication?: RiskAdjudicationMetadata;
  ragRetrievalRunId?: string | null;
  evidenceCitations?: EvidenceCitation[];
  mechanismExposures?: MechanismExposure[];
  personalMechanismAdjustments?: PersonalMechanismAdjustment[];
  scoringModelVersion?: 'mechanism_v1';
  model: string;
  promptVersion: string;
  imageDetail: ExtractionImageDetail;
  menuAnalysis?: MenuScanAnalysis;
}

export interface MenuScanAnalysis {
  kind: 'menu';
  menuTitle: string;
  menuConfidence: IngredientConfidence;
  inputPageCount: number;
  items: MenuItemAnalysis[];
  bestOptions: MenuRecommendation[];
  eatWithCautionOptions: MenuRecommendation[];
  worstOptions: MenuRecommendation[];
  summary: string;
}

export interface MenuItemAnalysis {
  id: string;
  name: string;
  description?: string;
  section?: string;
  price?: string;
  extractedIngredients: ExtractedIngredient[];
  inferredIngredients: ExtractedIngredient[];
  prepStyle: string[];
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  conditionSeverities?: ConditionSeverity[];
  dietFitHypotheses?: DietFitHypothesis[];
  confidence: IngredientConfidence;
  personalizedRiskScore: number;
  personalizedRiskLevel: RiskLevel;
}

export interface ScanResult {
  dishName: string;
  overallRiskScore: number;
  overallRiskLevel: RiskLevel;
  conditionRiskScores: Record<string, ConditionRisk>;
  possibleTriggers: string[];
  interpretation: string;
  pipTake?: string;
  summary?: string;
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  scoreContributors?: ScoreContributor[];
  scoringConfidence?: IngredientConfidence;
  gutRecommendation?: string;
  rubricVersion?: string;
  conditionRisks: ScanConditionRisk[];
  ingredientRisks: ScanIngredientRisk[];
  dietEvaluations: DietEvaluation[];
  menuResult?: MenuScanResult;
  groceryProduct?: GroceryProductSummary;
  structuredAnalysis: StructuredAnalysisV2;
  evidenceCitations?: EvidenceCitation[];
  gutScoreImpact?: GutScoreImpact;
  imageUri?: string;
}

export type ScanConsumptionStatus = 'unknown' | 'consumed' | 'skipped';

export interface ScanRecord extends ScanResult {
  id: string;
  consumptionStatus?: ScanConsumptionStatus;
  // One-tap portion answer from the consumed confirm ('light'/'normal'/'heavy').
  consumptionPortion?: ConsumptionPortion;
  // Additive day-load context: this meal repeats a same-day risk mechanism
  // from an earlier consumed meal ("Second dairy-heavy meal today…").
  dayLoad?: ScanDayLoad;
  requestId?: string;
  sourceType: ScanSourceType;
  scanCategory: ScanCategory;
  analysisStatus: AnalysisStatus;
  tokenCost: number;
  createdAt: string;
  completedAt?: string;
  inputText?: string;
  localDate?: string;
  timezone?: string;
}

export interface TopUpOption {
  id: string;
  label: string;
  tokens: number;
  price: string;
}

export interface BillingState {
  selectedPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  tokensRemaining: number;
  monthlyAllowance: number;
  trialEndsAt?: string;
  renewalAt?: string;
  topUpOptions: TopUpOption[];
}

export interface OnboardingStepDefinition {
  id: string;
  step: number;
  type: OnboardingStepType;
  backgroundVariant?: 'plain' | 'getStartedImage';
  headline: string;
  body: string;
  footerBody?: string;
  centerImage?: OnboardingCenterImage;
  centerGraphic?: OnboardingCenterGraphic;
  cta: string;
  field?: keyof OnboardingAnswers;
  options?: string[];
  optionIcons?: Partial<Record<string, string>>;
  allowCustom?: boolean;
  helper?: string;
  previewVariant?:
    | 'howItWorks'
    | 'resultPreview'
    | 'triggerPreview'
    | 'safeFoodsPreview'
    | 'knowBeforeEat'
    | 'trust'
    | 'summaryIntro'
    | 'scoreAnalyzing'
    | 'lowerScorePlan'
    | 'commitmentHold'
    | 'appStoreReview'
    | 'trialFreePreview'
    | 'recap';
}

export interface DishBlueprint {
  dishName: string;
  ingredients: string[];
  prepStyle: string[];
  notes: string[];
}

export interface ScanInputPayload {
  requestId?: string;
  sourceType: ScanSourceType;
  scanCategory?: ScanInputCategory;
  imageUri?: string;
  imageUris?: string[];
  imageDataUrl?: string;
  imageDataUrls?: string[];
  barcode?: string;
  text?: string;
  localDate?: string;
  timezone?: string;
}

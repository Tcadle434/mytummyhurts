export type RiskLevel = 'low' | 'medium' | 'high';
export type ScanSourceType = 'camera' | 'upload' | 'manual_photo' | 'manual_upload' | 'manual_text';
export type ScanCategory = 'food' | 'menu' | 'grocery';
export type AuthProvider = 'apple' | 'google' | 'email';
export type SubscriptionPlan = 'monthly' | 'annual';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'expired' | 'canceled';
export type OnboardingStage = 'intro' | 'flow' | 'paywall' | 'auth' | 'landing' | 'complete';
export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type PatternStrength = 'weak' | 'moderate' | 'strong';
export type IngredientConfidence = 'low' | 'medium' | 'high';
export type IngredientEvidence = 'visible' | 'inferred';
export type ExtractionClarity = 'clear' | 'unclear';
export type ExtractionImageDetail = 'high' | 'low' | 'not_applicable';
export type OnboardingStepType = 'message' | 'preview' | 'multi_select' | 'single_select' | 'text_input' | 'summary';
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
  | 'foodLeverComparison';
export type ProfileConfidenceLevel = 'early' | 'growing' | 'stable';
export type InsightConfidenceLevel = 'low' | 'medium' | 'high';
export type GutScorePhase = 'calm' | 'learn' | 'reintroduce';
export type GutScoreConfidenceLevel = 'low' | 'medium' | 'high';
export type GutScoreTrendDirection = 'down' | 'up' | 'flat';

export interface InsightSourceBreakdown {
  declared: boolean;
  science: boolean;
  personal: boolean;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
}

export interface ProfileLearningSignal {
  ingredientName: string;
  score: number;
  confidenceLevel: InsightConfidenceLevel;
  evidenceCount: number;
}

export interface ProfileLearningEvent {
  ingredientName: string;
  outcome: 'calm' | 'reactive';
  gutSeverity: number;
  submittedAt: string;
}

export interface GutScoreComponents {
  recentDailyOutcome: number;
  symptomFreeConsistency: number;
  personalizedIngredientEvidence: number;
  recentFoodLoad: number;
  dataConfidence: number;
}

export interface ScoreDriver {
  id: string;
  label: string;
  detail: string;
  impact: 'raises' | 'lowers' | 'neutral';
  weight: number;
}

export type GutScoreDriver = ScoreDriver;

export interface DailyScoreComponents {
  symptomScore: number;
  foodExposure: number;
  foodAdjustment: number;
  evidenceWeight: number;
}

export type DailyScoreDriver = ScoreDriver;

export interface GutScoreHistoryPoint {
  score: number;
  createdAt: string;
}

export interface GutScoreEvent {
  id?: string;
  eventType: string;
  algorithmVersion: string;
  scoreBefore?: number;
  scoreAfter: number;
  scoreDelta: number;
  phaseBefore?: GutScorePhase;
  phaseAfter: GutScorePhase;
  summary: string;
  drivers: GutScoreDriver[];
  createdAt: string;
}

export interface GutScoreState {
  algorithmVersion: string;
  currentScore: number;
  baselineScore: number;
  phase: GutScorePhase;
  confidenceLevel: GutScoreConfidenceLevel;
  trendDelta7d: number;
  trendDirection: GutScoreTrendDirection;
  components: GutScoreComponents;
  drivers: GutScoreDriver[];
  history: GutScoreHistoryPoint[];
  nextAction: string;
  updatedAt: string;
  recentEvent?: GutScoreEvent;
}

export interface GutScoreImpact {
  currentScore?: number;
  projectedScore?: number;
  projectedDelta: number;
  direction: 'raise' | 'lower' | 'neutral';
  summary: string;
  drivers: string[];
}

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
  symptoms: string[];
  customSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  triedOtherGutHealthApps?: string;
  motivation?: string;
  currentEatingPatterns: string[];
  lifestyleFactors: string[];
  favoriteFoodsToReintroduce: string;
}

export interface StomachProfileIngredientScore {
  triggerScore: number;
  safeScore: number;
  combinedRiskScore: number;
  confidenceLevel: InsightConfidenceLevel;
  linkedConditions: string[];
  evidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  sourceBreakdown: InsightSourceBreakdown;
  lastUpdatedAt: string;
  lastSeenAt?: string;
  lastOutcomeAt?: string;
}

export interface StomachProfile {
  version: number;
  conditions: { name: string; source: 'user' | 'learned'; active: boolean }[];
  declaredIngredientSensitivities: { name: string; source: 'user' | 'learned'; active: boolean }[];
  ingredientScores: Record<string, StomachProfileIngredientScore>;
  conditionSensitivityWeights: Record<string, number>;
  freeformCustomNotes: string[];
  metadata: {
    profileConfidenceLevel: ProfileConfidenceLevel;
    reportCount: number;
    learnedIngredientCount: number;
    topTriggers: ProfileLearningSignal[];
    topSafeFoods: ProfileLearningSignal[];
    declaredSensitivities: string[];
    recentLearningEvent?: ProfileLearningEvent;
    gutScore?: GutScoreState;
  };
}

export interface UserProfile {
  userId: string;
  displayName?: string;
  knownConditions: string[];
  knownIngredientSensitivities: string[];
  commonSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  motivation?: string;
  currentEatingPatterns: string[];
  lifestyleFactors: string[];
  foodsToReintroduce: string[];
  stomachProfile: StomachProfile;
}

export interface StructuredIngredient {
  name: string;
  confidence: IngredientConfidence;
}

export interface MealComponent {
  name: string;
  confidence: IngredientConfidence;
  prepStyle: string[];
}

export interface ExtractedIngredient {
  rawName: string;
  canonicalName: string;
  confidence: IngredientConfidence;
  component?: string;
  evidence: IngredientEvidence;
}

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
  model: string;
  promptVersion: string;
  imageDetail: ExtractionImageDetail;
}

export interface ConditionRisk {
  score: number;
  level: RiskLevel;
}

export interface ScanResult {
  dishName: string;
  overallRiskScore: number;
  overallRiskLevel: RiskLevel;
  conditionRiskScores: Record<string, ConditionRisk>;
  possibleTriggers: string[];
  interpretation: string;
  structuredAnalysis: StructuredAnalysisV2;
  gutScoreImpact?: GutScoreImpact;
  imageUri?: string;
}

export interface ScanRecord extends ScanResult {
  id: string;
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

export interface DailyGutReport {
  id: string;
  userId: string;
  localDate: string;
  gutSeverity: number;
  dailyScore?: number;
  dailyScoreComponents?: DailyScoreComponents;
  dailyScoreDrivers?: DailyScoreDriver[];
  dailyScoreUpdatedAt?: string;
  symptomTags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientInsight {
  id: string;
  ingredientName: string;
  triggerScore: number;
  safeScore: number;
  combinedRiskScore: number;
  confidenceLevel: InsightConfidenceLevel;
  patternStrength: PatternStrength;
  linkedConditions: string[];
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  lastSeenAt?: string;
  lastOutcomeAt?: string;
  sourceBreakdown: InsightSourceBreakdown;
  lastRecomputedAt: string;
  summary: string;
}

export interface ConditionIngredientInsight {
  id: string;
  ingredientName: string;
  conditionName: string;
  riskScore: number;
  triggerScore: number;
  safeScore: number;
  confidenceLevel: InsightConfidenceLevel;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  supportingEvidenceCount: number;
  sourceBreakdown: InsightSourceBreakdown;
  lastSeenAt?: string;
  lastOutcomeAt?: string;
  lastRecomputedAt: string;
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
    | 'trust'
    | 'summaryIntro'
    | 'scoreAnalyzing'
    | 'lowerScorePlan'
    | 'recap';
}

export interface DishBlueprint {
  dishName: string;
  ingredients: string[];
  prepStyle: string[];
  notes: string[];
}

export interface ScanInputPayload {
  sourceType: ScanSourceType;
  scanCategory?: ScanCategory;
  imageUri?: string;
  text?: string;
  localDate?: string;
  timezone?: string;
}

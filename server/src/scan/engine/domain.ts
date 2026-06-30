import type {
  RiskLevel,
  PatternStrength,
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
// EvidenceCitation: this server scan shape (optional chunkId, no documentType)
// differs from the package's EvidenceCitation. Kept local so the FE/server scan
// shape is preserved; reconciling with the package version needs a human
// decision.
// ---------------------------------------------------------------------------
export interface EvidenceCitation {
  id: string;
  title: string;
  source: string;
  url?: string;
  chunkId?: string;
  snippet?: string;
  relevanceScore?: number;
}

// ---------------------------------------------------------------------------
// StructuredAnalysisV2 / MenuScanAnalysis / MenuItemAnalysis / ScanResult /
// ScanRecord: kept local because MenuItemAnalysis carries an extra
// scoring-internal field (componentRoles) that the FE shape does not, so this
// graph is not byte-identical across the two apps. They reference the
// re-exported shared types above.
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
  // Scoring-internal: names of non-dominant (side/condiment/drink) components,
  // used to down-weight their risk contributors. Never serialized to the client.
  componentRoles?: { secondaryComponents: string[] };
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

export interface ScanRecord extends ScanResult {
  id: string;
  consumptionStatus?: 'unknown' | 'consumed' | 'skipped';
  requestId?: string;
  sourceType: ScanSourceType;
  scanCategory: ScanCategory;
  analysisStatus: 'queued' | 'processing' | 'completed' | 'failed';
  tokenCost: number;
  createdAt: string;
  completedAt?: string;
  inputText?: string;
  localDate?: string;
  timezone?: string;
}

// ---------------------------------------------------------------------------
// Server-only domain types (not shared with the Expo app).
// ---------------------------------------------------------------------------
export interface ProfileSeed {
  userId: string;
  displayName?: string;
  knownConditions: string[];
  knownIngredientSensitivities: string[];
  commonSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  motivation?: string;
  currentEatingPatterns?: string[];
  lifestyleFactors?: string[];
  foodsToReintroduce?: string[];
  dietPreferences?: DietPreference[];
  calibrationRatings?: Record<string, FoodCalibrationRating>;
  suspectMealIngredients?: string[];
}

export interface ScanForInsightRecompute {
  id: string;
  structuredAnalysis: StructuredAnalysisV2;
  ingredients?: StructuredIngredient[];
  overallRiskScore?: number;
  createdAt?: string;
  localDate?: string;
  scanCategory?: ScanCategory;
}

export interface ExtractionResult extends StructuredAnalysisV2 {}

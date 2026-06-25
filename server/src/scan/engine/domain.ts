export type RiskLevel = 'low' | 'medium' | 'high';
export type PatternStrength = 'weak' | 'moderate' | 'strong';
export type IngredientConfidence = 'low' | 'medium' | 'high';
export type IngredientEvidence = 'visible' | 'inferred' | 'label' | 'database';
export type ExtractionClarity = 'clear' | 'unclear';
export type ExtractionImageDetail = 'high' | 'low' | 'not_applicable';
export type ScanSourceType = 'camera' | 'upload' | 'manual_photo' | 'manual_upload' | 'manual_text' | 'barcode';
export type ScanCategory = 'food' | 'menu' | 'grocery';
export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type DietPreferenceKey =
  | 'low_fodmap'
  | 'gerd_friendly'
  | 'dairy_free'
  | 'gluten_free'
  | 'anti_inflammatory'
  | 'seed_oil_free'
  | 'low_histamine'
  | 'low_fat_gentle'
  | 'vegetarian'
  | 'vegan';
export type DietFitStatus = 'fits' | 'caution' | 'does_not_fit' | 'unknown';
export type ProfileLearningStage = 'early' | 'growing' | 'confident';
export type ProfileConfidenceLevel = ProfileLearningStage;
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
  conditions: Array<{ name: string; source: 'user' | 'learned'; active: boolean }>;
  declaredIngredientSensitivities: Array<{ name: string; source: 'user' | 'learned'; active: boolean }>;
  ingredientScores: Record<string, StomachProfileIngredientScore>;
  conditionSensitivityWeights: Record<string, number>;
  freeformCustomNotes: string[];
  metadata: {
    profileConfidenceLevel: ProfileConfidenceLevel;
    reportCount: number;
    learningEvidenceDays?: number;
    learningMealScanCount?: number;
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
  dietPreferences: DietPreference[];
  stomachProfile: StomachProfile;
}

export interface DietPreference {
  key: DietPreferenceKey;
  label: string;
  strictness: 'standard' | 'strict';
  source: 'onboarding' | 'settings';
}

export interface DietFitHypothesis {
  dietKey: DietPreferenceKey;
  status: DietFitStatus;
  confidence: IngredientConfidence;
  evidence: string[];
  conflicts: string[];
  missingInfo: string[];
  reason: string;
}

export interface DietEvaluation {
  id?: string;
  menuItemId?: string;
  menuItemSourceId?: string;
  dietKey: DietPreferenceKey;
  dietLabel: string;
  status: DietFitStatus;
  confidence: IngredientConfidence;
  reason: string;
  supportingFactors: string[];
  conflicts: string[];
  missingInfo: string[];
  scoreAdjustment: number;
  modelStatus?: DietFitStatus;
  modelConfidence?: IngredientConfidence;
  modelReason?: string;
  acceptedModelStatus: boolean;
  rubricVersion: string;
  displayOrder?: number;
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

// Structured role/prominence the LLM assigns per ingredient. The scorer reads
// these instead of inferring "main vs side" from free-text phrasing, which used
// to make the same ingredient swing in weight depending on wording.
export type IngredientRole = 'main' | 'side' | 'condiment' | 'garnish' | 'base';
export type IngredientProminence = 'primary' | 'secondary' | 'trace';

export interface ExtractedIngredient {
  rawName: string;
  canonicalName: string;
  confidence: IngredientConfidence;
  component?: string;
  evidence: IngredientEvidence;
  role?: IngredientRole;
  prominence?: IngredientProminence;
}

export type ConditionSeverityBand = 'none' | 'mild' | 'moderate' | 'high' | 'severe';

// LLM-judged per-condition severity for a single food scan or menu item. The
// band is the primary signal the deterministic scorer anchors to; drivers are
// the cited ingredients/prep that justify it.
export interface ConditionSeverity {
  condition: string;
  band: ConditionSeverityBand;
  drivers: string[];
  rationale?: string;
}

export interface EvidenceCitation {
  id: string;
  title: string;
  source: string;
  url?: string;
  chunkId?: string;
  snippet?: string;
  relevanceScore?: number;
}

export interface RiskAdjudicationMetadata {
  promptVersion: string;
  source: 'llm' | 'fallback';
  ragRetrievalRunId?: string | null;
  conditionSeverities: Array<{
    condition: string;
    genericBand: ConditionSeverityBand;
    personalizedBand: ConditionSeverityBand;
    finalBand: ConditionSeverityBand;
    drivers: string[];
    protectiveEvidence: string[];
    citationChunkIds: string[];
    personalEvidenceUsed: string[];
    confidence: IngredientConfidence;
    rationale: string;
  }>;
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

export type MenuBaseFoodCategoryKey =
  | 'lean_meat_poultry'
  | 'fatty_or_rich_meat'
  | 'processed_meat'
  | 'lean_seafood'
  | 'fatty_seafood'
  | 'egg_based'
  | 'dairy_based'
  | 'wheat_grain_based'
  | 'non_wheat_grain_based'
  | 'root_tuber_starch_based'
  | 'legume_soy_pulse_based'
  | 'low_fermentation_vegetable_based'
  | 'high_fermentation_vegetable_based'
  | 'fruit_based'
  | 'nuts_seeds_or_oils_based'
  | 'dessert_sweet_based'
  | 'non_alcoholic_beverage'
  | 'alcoholic_beverage'
  | 'sauce_condiment_or_dressing'
  | 'soup_stew_or_broth'
  | 'mixed_dish_or_entree'
  | 'unknown';

export type MenuRiskModifierKey =
  | 'fried_or_crispy'
  | 'high_fat_or_rich'
  | 'creamy_or_lactose'
  | 'spicy_heat'
  | 'acidic_tomato_citrus_vinegar'
  | 'allium_garlic_onion'
  | 'wheat_fructan_or_gluten'
  | 'legume_gos'
  | 'high_fiber_or_gassy'
  | 'fermented_or_histamine'
  | 'high_fructose'
  | 'sweet_polyol'
  | 'added_sugar'
  | 'caffeine'
  | 'alcohol'
  | 'carbonation'
  | 'large_or_loaded_portion'
  | 'unknown_sauce_or_marinade'
  | 'raw_or_undercooked'
  | 'chocolate_or_mint'
  | 'ultra_processed_additives'
  | 'simple_prep'
  | 'plain_or_lightly_seasoned'
  | 'rice_or_simple_starch'
  | 'lean_protein'
  | 'low_fermentation_plant'
  | 'broth_based'
  | 'low_fat';

export type MenuRubricEvidence =
  | 'name'
  | 'description'
  | 'section'
  | 'prep'
  | 'ingredient'
  | 'common_dish_knowledge'
  | 'nutrition_label'
  | 'label_claim'
  | 'unclear';

export interface MenuBaseFoodCategory {
  key: MenuBaseFoodCategoryKey;
  confidence: IngredientConfidence;
  evidence: MenuRubricEvidence;
  source: string;
}

export interface MenuRiskModifier {
  key: MenuRiskModifierKey;
  confidence: IngredientConfidence;
  evidence: MenuRubricEvidence;
  source: string;
}

export interface MenuRecommendation {
  rank: number;
  itemId: string;
  name: string;
  personalizedRiskScore: number;
  personalizedRiskLevel: RiskLevel;
  reasons: string[];
  triggerIngredients: string[];
  saferModification?: string;
}

export interface ConditionRisk {
  score: number;
  level: RiskLevel;
}

export interface ScanConditionRisk {
  conditionName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  reason: string;
  displayOrder: number;
}

export interface ScanIngredientRisk {
  id?: string;
  menuItemId?: string;
  menuItemSourceId?: string;
  rawName: string;
  canonicalName: string;
  riskScore: number;
  riskLevel: RiskLevel;
  evidence: IngredientEvidence;
  confidence: IngredientConfidence;
  componentName?: string;
  reason: string;
  displayOrder: number;
}

export type MenuRecommendationTier = 'best_for_you' | 'eat_with_caution' | 'try_to_avoid';
export type ScoreContributorEvidence =
  | 'ingredient'
  | 'prep'
  | 'description'
  | 'profile'
  | 'learning'
  | 'uncertainty'
  | 'protective'
  | 'rubric';

export interface ScoreContributor {
  key: string;
  label: string;
  points: number;
  evidence: ScoreContributorEvidence;
  source: string;
  reason: string;
}

export interface ScanMenuItemResult {
  id: string;
  sourceItemId: string;
  consumedAt?: string;
  tier: MenuRecommendationTier;
  tierRank: number;
  displayOrder: number;
  name: string;
  description?: string;
  section?: string;
  price?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: IngredientConfidence;
  scoringConfidence: IngredientConfidence;
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  scoreContributors: ScoreContributor[];
  whyThisScore: string;
  gutRecommendation?: string;
  ingredientRisks: ScanIngredientRisk[];
  dietEvaluations: DietEvaluation[];
}

export interface MenuScanResult {
  menuTitle: string;
  inputPageCount: number;
  summary: string;
  items: ScanMenuItemResult[];
  bestForYou: ScanMenuItemResult[];
  eatWithCaution: ScanMenuItemResult[];
  tryToAvoid: ScanMenuItemResult[];
}

export interface GroceryProductSummary {
  id?: string;
  barcode?: string;
  brand?: string;
  name: string;
  ingredientText?: string;
  nutrition?: Record<string, unknown>;
  allergens?: string[];
  imageUrl?: string;
  dataSource?: string;
  sourceConfidence?: IngredientConfidence;
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

export interface ScanHistorySummary {
  id: string;
  requestId?: string;
  sourceType: ScanSourceType;
  scanCategory: ScanCategory;
  analysisStatus: AnalysisStatus;
  tokenCost: number;
  createdAt: string;
  completedAt?: string;
  localDate?: string;
  timezone?: string;
  dishName: string;
  overallRiskScore: number;
  overallRiskLevel: RiskLevel;
  imageUri?: string;
}

export interface DailyGutReport {
  id: string;
  userId: string;
  localDate: string;
  gutSeverity: number;
  evidenceQuality?: 'typical' | 'unscanned';
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
  taxonomy?: IngredientTaxonomyClassification;
}

export type DigestivePatternKey =
  | 'lactose_dairy'
  | 'allium_fructans'
  | 'wheat_fructan_gluten'
  | 'legume_gos'
  | 'excess_fructose'
  | 'polyol_sweeteners'
  | 'gassy_high_fiber_plants'
  | 'high_fat_rich'
  | 'fried_crispy'
  | 'acidic_pickled'
  | 'spicy_heat'
  | 'caffeine_stimulants'
  | 'carbonation'
  | 'alcohol'
  | 'chocolate_cocoa'
  | 'mint'
  | 'fermented_aged_histamine'
  | 'ultra_processed_additives';

export type TrackedFoodFamilyKey =
  | 'lean_poultry_meat'
  | 'fatty_rich_meat'
  | 'processed_cured_meat'
  | 'lean_seafood'
  | 'fatty_seafood'
  | 'eggs'
  | 'dairy_foods'
  | 'wheat_grains'
  | 'non_wheat_grains'
  | 'root_tuber_starches'
  | 'legumes_soy_pulses'
  | 'gentle_vegetables_seaweed'
  | 'gassy_vegetables'
  | 'allium_vegetables'
  | 'tomato_citrus_fruit'
  | 'other_fruits'
  | 'nuts_seeds'
  | 'plant_fats_spreads'
  | 'sauces_condiments'
  | 'pickled_fermented'
  | 'desserts_sweets'
  | 'sugar_free_diet'
  | 'non_alcoholic_drinks'
  | 'alcoholic_drinks'
  | 'soups_stews_broths'
  | 'mixed_dishes'
  | 'unknown_unclassified';

export type IngredientTaxonomyConfidence = 'high' | 'medium' | 'low';
export type IngredientTaxonomySource = 'llm' | 'deterministic' | 'manual';

export interface IngredientTaxonomyClassification {
  primaryFoodFamilyKey: TrackedFoodFamilyKey;
  digestivePatternKeys: DigestivePatternKey[];
  confidence: IngredientTaxonomyConfidence;
  reason: string;
  taxonomyVersion: string;
  model?: string;
  promptVersion?: string;
  source: IngredientTaxonomySource;
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

export type FoodCalibrationRating = 'fine' | 'unsure' | 'bad';

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

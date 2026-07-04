// Scan input/extraction/result domain types. Shared verbatim by the Expo app
// (src/types/domain.ts) and the NestJS server (server/src/scan/engine/domain.ts).
//
// NOTE: StructuredAnalysisV2, MenuScanAnalysis, MenuItemAnalysis, ScanResult and
// ScanRecord are intentionally NOT shared here — they diverge between the apps
// (the server adds scoring-internal fields) and remain defined locally in each
// domain.ts. The pieces below are the parts that are byte-for-byte identical.

import type { RiskLevel } from './index';
import type { IngredientConfidence, InsightConfidenceLevel, DietEvaluation } from './profile';
import type {
  MenuBaseFoodCategory,
  MenuRiskModifier,
  MenuRecommendationTier,
  ScoreContributor,
} from './menu';

export type ScanSourceType = 'camera' | 'upload' | 'manual_photo' | 'manual_upload' | 'manual_text' | 'barcode';
export type ScanCategory = 'food' | 'menu' | 'grocery';
export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type IngredientEvidence = 'visible' | 'inferred' | 'label' | 'database';
export type ExtractionClarity = 'clear' | 'unclear';
export type ExtractionImageDetail = 'high' | 'low' | 'not_applicable';

export interface StructuredIngredient {
  name: string;
  confidence: IngredientConfidence;
}

export interface MealComponent {
  name: string;
  confidence: IngredientConfidence;
  prepStyle: string[];
}

export type IngredientRole = 'main' | 'side' | 'condiment' | 'garnish' | 'base';
export type IngredientProminence = 'primary' | 'secondary' | 'trace';
export type IngredientAmountEstimate = 'trace' | 'small' | 'standard' | 'large' | 'dominant';

// How much of a confirmed meal the user says they ate. Captured as a one-tap
// choice on the consumption confirm; 'normal' is the zero-friction default.
export type ConsumptionPortion = 'light' | 'normal' | 'heavy';

// Additive day-load context on a completed scan: this scan repeats a risk
// mechanism (e.g. dairy) that already appeared in an earlier consumed meal on
// the same local day. Display + data only in v1 — it never moves the score.
export interface ScanDayLoad {
  mechanismKey: string;
  priorMealCount: number;
  note: string;
}

export interface ExtractedIngredient {
  rawName: string;
  canonicalName: string;
  confidence: IngredientConfidence;
  component?: string;
  evidence: IngredientEvidence;
  role?: IngredientRole;
  prominence?: IngredientProminence;
  amountEstimate?: IngredientAmountEstimate;
  amountBasis?: string;
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

export interface RiskAdjudicationMetadata {
  promptVersion: string;
  source: 'llm' | 'fallback';
  ragRetrievalRunId?: string | null;
  warnings?: string[];
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

export interface MechanismExposure {
  mechanismKey: string;
  condition: string;
  ingredient: string;
  basePoints: number;
  amount: IngredientAmountEstimate;
  role?: IngredientRole;
  prominence?: IngredientProminence;
  confidence: IngredientConfidence;
  points: number;
  reason: string;
}

export interface PersonalMechanismAdjustment {
  mechanismKey: string;
  condition: string;
  ingredient: string;
  points: number;
  evidenceCount: number;
  reason: string;
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

export type ScanIngredientPersonalHistoryMatchType = 'exact' | 'family' | 'none';
export type ScanIngredientPersonalHistoryRiskLevel = RiskLevel | 'inconsistent' | 'unknown';

export interface ScanIngredientPersonalHistory {
  exactScanCount: number;
  familyScanCount: number;
  lastSeenAt?: string;
  matchType: ScanIngredientPersonalHistoryMatchType;
  matchedLabel?: string;
  riskLevel: ScanIngredientPersonalHistoryRiskLevel;
  riskScore?: number;
  confidenceLevel?: InsightConfidenceLevel;
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  summary: string;
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
  // Extraction's portion-size read for this ingredient ('trace'…'dominant').
  // Persisted so dose-weighted learning can read it back without re-parsing
  // the stored extraction JSON. Absent on rows saved before Phase 4.
  amountEstimate?: IngredientAmountEstimate;
  personalHistory?: ScanIngredientPersonalHistory;
}

export interface ScanMenuItemResult {
  id: string;
  sourceItemId: string;
  consumedAt?: string;
  consumedPortion?: ConsumptionPortion;
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

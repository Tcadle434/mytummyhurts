export type RiskLevel = 'low' | 'medium' | 'high';
export type SymptomSeverity = 'felt_good' | 'mild' | 'moderate' | 'severe';
export type PatternStrength = 'weak' | 'moderate' | 'strong';
export type IngredientConfidence = 'low' | 'medium' | 'high';
export type ScanSourceType = 'camera' | 'upload' | 'manual_photo' | 'manual_upload' | 'manual_text';
export type FollowupState = 'pending' | 'dismissed' | 'answered_yes' | 'answered_no' | 'archived';
export type EatenTimeBucket = 'just_now' | 'one_to_two_hours' | 'earlier_today' | 'yesterday' | 'unknown';

export interface StomachProfileIngredientScore {
  triggerScore: number;
  safeScore: number;
  linkedConditions: string[];
  evidenceCount: number;
  lastUpdatedAt: string;
}

export interface StomachProfile {
  version: number;
  conditions: Array<{ name: string; source: 'user' | 'learned'; active: boolean }>;
  declaredIngredientSensitivities: Array<{ name: string; source: 'user' | 'learned'; active: boolean }>;
  ingredientScores: Record<string, StomachProfileIngredientScore>;
  conditionSensitivityWeights: Record<string, number>;
  freeformCustomNotes: string[];
  metadata: {
    profileConfidenceLevel: 'early' | 'growing' | 'stable';
    confirmedMealCount: number;
  };
}

export interface UserProfile {
  userId: string;
  knownConditions: string[];
  knownIngredientSensitivities: string[];
  commonSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  motivation?: string;
  stomachProfile: StomachProfile;
}

export interface StructuredIngredient {
  name: string;
  confidence: IngredientConfidence;
}

export interface StructuredAnalysis {
  dishName: string;
  ingredients: StructuredIngredient[];
  prepStyle: string[];
  notes: string[];
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
  structuredAnalysis: StructuredAnalysis;
  imageUri?: string;
}

export interface ScanRecord extends ScanResult {
  id: string;
  sourceType: ScanSourceType;
  analysisStatus: 'queued' | 'processing' | 'completed' | 'failed';
  tokenCost: number;
  createdAt: string;
  completedAt?: string;
  inputText?: string;
}

export interface MealRecord {
  id: string;
  title: string;
  imageUri?: string;
  scanId?: string;
  mealOrigin: ScanSourceType;
  didUserEat?: boolean;
  eatenTimeBucket?: EatenTimeBucket;
  followupState: FollowupState;
  followupDueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealSymptomRecord {
  id: string;
  mealId: string;
  severity: SymptomSeverity;
  symptomTags: string[];
  otherText?: string;
  submittedAt: string;
}

export interface IngredientInsight {
  id: string;
  ingredientName: string;
  triggerScore: number;
  safeScore: number;
  patternStrength: PatternStrength;
  linkedConditions: string[];
  supportingEvidenceCount: number;
  lastRecomputedAt: string;
  summary: string;
}

export interface ProfileSeed {
  userId: string;
  knownConditions: string[];
  knownIngredientSensitivities: string[];
  commonSymptoms: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts: string[];
  motivation?: string;
}

export interface ScanForInsightRecompute {
  id: string;
  structuredAnalysis: { ingredients: StructuredIngredient[] };
}

export interface MealForInsightRecompute {
  id: string;
  scanId?: string | null;
  didUserEat?: boolean | null;
}

export interface SymptomForInsightRecompute {
  mealId: string;
  severity: SymptomSeverity;
  symptomTags: string[];
}

export interface ExtractionResult extends StructuredAnalysis {
  clarity: 'clear' | 'unclear';
  unclearReason?: string;
}

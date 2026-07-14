import type {
  ConditionSeverityBand,
  IngredientAmountEstimate,
  IngredientConfidence,
  IngredientEvidence,
  IngredientProminence,
  IngredientRole,
} from '../engine/domain';
import type { OpenAiAuditLog } from '../engine/openaiTypes';

export const CONCERN_V1_VERSION = 'concern_v1' as const;

export const SUPPORTED_CONDITION_KEYS = [
  'ibs',
  'gerd',
  'lactose_intolerance',
  'gluten_sensitivity',
  'general_discomfort',
] as const;

export type SupportedConditionKey = (typeof SUPPORTED_CONDITION_KEYS)[number];

export const CONCERN_MECHANISM_KEYS = [
  'fructan_allium',
  'fructan_wheat',
  'gos_legume',
  'polyol',
  'excess_fructose',
  'lactose',
  'gluten_exposure',
  'high_fat_load',
  'fried_preparation',
  'acidic_food',
  'spicy_food',
  'caffeine',
  'alcohol',
  'carbonation',
  'chocolate_or_mint',
  'large_meal_load',
  'uncertain_compound',
] as const;

export type ConcernMechanismKey = (typeof CONCERN_MECHANISM_KEYS)[number];

export type ConcernDirection = 'raises' | 'lowers' | 'context';
export type EvidenceStrength = 'high' | 'moderate' | 'limited';
export type ConcernBandPosition = 'lower' | 'middle' | 'upper';

export interface ConcernConditionContext {
  key: SupportedConditionKey;
  label: string;
  profileValue: string;
  symptomContext: string[];
}

export interface ConcernFoodFact {
  id: string;
  rawName: string;
  canonicalName: string;
  evidence: IngredientEvidence;
  confidence: IngredientConfidence;
  amount: IngredientAmountEstimate;
  role: IngredientRole;
  prominence: IngredientProminence;
  component?: string;
  amountBasis?: string;
}

export interface ConcernSubject {
  id: string;
  name: string;
  description?: string;
  section?: string;
  clarity: 'clear' | 'unclear';
  facts: ConcernFoodFact[];
  prepStyle: string[];
  notes: string[];
}

export interface ConcernMechanismExposure {
  mechanismKey: ConcernMechanismKey;
  sourceFactIds: string[];
  sourceLabel: string;
  amount: IngredientAmountEstimate;
  confidence: IngredientConfidence;
  basis: string;
}

export interface ConcernMechanismMap {
  subjectId: string;
  exposures: ConcernMechanismExposure[];
  unresolvedFacts: string[];
}

export interface ConcernEvidenceSource {
  title: string;
  organization: string;
  url: string;
  publishedYear: number;
  sourceType: 'clinical_guideline' | 'government_health' | 'patient_guidance' | 'clinical_practice_update' | 'randomized_trial';
}

export interface ConcernEvidenceClaim {
  id: string;
  conditions: SupportedConditionKey[];
  mechanisms: ConcernMechanismKey[];
  direction: ConcernDirection;
  strength: EvidenceStrength;
  summary: string;
  applicability: string;
  limitations: string;
  source: ConcernEvidenceSource;
}

export interface ConcernPersonalEvidence {
  id: string;
  ingredientName: string;
  matchedFactIds: string[];
  confidence: IngredientConfidence;
  calmEvidenceCount: number;
  reactiveEvidenceCount: number;
  summary: string;
}

export interface ConcernConditionDecision {
  conditionKey: SupportedConditionKey;
  genericBand: ConditionSeverityBand;
  personalizedBand: ConditionSeverityBand;
  position: ConcernBandPosition;
  confidence: IngredientConfidence;
  mechanismKeys: ConcernMechanismKey[];
  sourceFactIds: string[];
  claimIds: string[];
  personalEvidenceIds: string[];
  rationale: string;
  action: string;
}

export interface ConcernSubjectDecision {
  subjectId: string;
  conditions: ConcernConditionDecision[];
}

export interface ConcernVerification {
  conditionKey: SupportedConditionKey;
  status: 'accepted' | 'lowered' | 'uncertain';
  verifiedBand: ConditionSeverityBand;
  verifiedPosition: ConcernBandPosition;
  confidence: IngredientConfidence;
  validMechanismKeys: ConcernMechanismKey[];
  validSourceFactIds: string[];
  validClaimIds: string[];
  validPersonalEvidenceIds: string[];
  reason: string;
  action: string;
}

export interface ConcernSubjectVerification {
  subjectId: string;
  conditions: ConcernVerification[];
}

export interface ConcernConditionResult {
  conditionKey: SupportedConditionKey;
  conditionLabel: string;
  score: number;
  band: ConditionSeverityBand;
  confidence: IngredientConfidence;
  verificationStatus: ConcernVerification['status'];
  mechanisms: ConcernMechanismKey[];
  sourceFactIds: string[];
  claimIds: string[];
  personalEvidenceIds: string[];
  rationale: string;
  action: string;
}

export interface ConcernSubjectResult {
  subjectId: string;
  subjectName: string;
  score: number;
  band: ConditionSeverityBand;
  confidence: IngredientConfidence;
  drivingConditionKey: SupportedConditionKey;
  drivingConditionLabel: string;
  conditions: ConcernConditionResult[];
}

export interface ConcernV1Result {
  engineVersion: typeof CONCERN_V1_VERSION;
  evidenceVersion: string;
  status: 'completed';
  conditions: ConcernConditionContext[];
  subjects: ConcernSubjectResult[];
  generatedAt: string;
}

export interface ConcernV1Failure {
  engineVersion: typeof CONCERN_V1_VERSION;
  evidenceVersion: string;
  status: 'failed';
  stage: 'initialization' | 'mechanism_mapping' | 'adjudication' | 'verification' | 'finalization';
  code: string;
}

export type ConcernV1ShadowResult = ConcernV1Result | ConcernV1Failure;

export interface ConcernV1ShadowRun {
  result: ConcernV1ShadowResult;
  audits: OpenAiAuditLog[];
}

import type {
  ConditionSeverity,
  ConditionSeverityBand,
  EvidenceCitation,
  IngredientConfidence,
  IngredientInsight,
  StructuredAnalysisV2,
  UserProfile,
} from './domain';
import { CONDITION_BAND_ORDER } from '@mth/shared-domain';
import { normalize } from './text-utils';

// Canonical citation shape lives in the package; re-exported (via domain.ts)
// so the existing `import { ... EvidenceCitation } from '.../riskAdjudication'`
// call site (scan-workflow.service.ts) is unaffected.
export type { EvidenceCitation } from './domain';

export const RISK_ADJUDICATION_PROMPT_VERSION =
  process.env.OPENAI_RISK_ADJUDICATION_PROMPT_VERSION ?? 'mytummyhurts_risk_adjudication_v2';

export const CONDITION_SEVERITY_BANDS: readonly ConditionSeverityBand[] = CONDITION_BAND_ORDER;

export type RiskAdjudicationConfidence = IngredientConfidence;

export interface PersonalRiskEvidence {
  ingredientName: string;
  combinedRiskScore: number;
  confidenceLevel: IngredientInsight['confidenceLevel'];
  supportingEvidenceCount: number;
  calmEvidenceCount: number;
  reactiveEvidenceCount: number;
  summary: string;
}

export interface RiskAdjudicationEvidenceChunk {
  chunkId: string;
  title: string;
  source: string;
  url?: string | null;
  content: string;
  conditionTags: string[];
  ingredientTags: string[];
  direction: 'raises' | 'lowers' | 'neutral' | null;
  relevanceScore: number;
}

export interface RawRiskAdjudicationCondition {
  condition: string;
  genericBand: ConditionSeverityBand;
  personalizedBand: ConditionSeverityBand;
  finalBand: ConditionSeverityBand;
  drivers: string[];
  protectiveEvidence: string[];
  citationChunkIds: string[];
  personalEvidenceUsed: string[];
  confidence: RiskAdjudicationConfidence;
  rationale: string;
}

export interface RiskAdjudicationPayload {
  conditionSeverities: RawRiskAdjudicationCondition[];
}

export interface RiskAdjudicationRequest {
  structuredAnalysis: StructuredAnalysisV2;
  knownConditions: string[];
  personalEvidence: PersonalRiskEvidence[];
  ragEvidence: RiskAdjudicationEvidenceChunk[];
}

export interface RiskAdjudicationMetadata {
  promptVersion: string;
  source: 'llm' | 'fallback';
  ragRetrievalRunId?: string | null;
  warnings?: string[];
  conditionSeverities: RawRiskAdjudicationCondition[];
}

export interface ValidatedRiskAdjudication {
  conditionSeverities: ConditionSeverity[];
  metadata: RiskAdjudicationMetadata;
  evidenceCitations: EvidenceCitation[];
}

const INGREDIENT_ALIASES: Record<string, string[]> = {
  bread: ['wheat', 'gluten', 'fructan', 'roll', 'bun', 'sub roll'],
  wheat: ['bread', 'gluten', 'fructan', 'pasta', 'roll', 'bun'],
  cheese: ['dairy', 'lactose'],
  dairy: ['cheese', 'milk', 'lactose', 'cream', 'yogurt'],
  mayonnaise: ['mayo', 'dressing', 'aioli'],
  deli: ['deli meat', 'processed meat', 'ham', 'turkey'],
  'deli meat': ['processed meat', 'ham', 'turkey'],
};

function bandIndex(band: ConditionSeverityBand) {
  return Math.max(0, CONDITION_SEVERITY_BANDS.indexOf(band));
}

function bandAt(index: number): ConditionSeverityBand {
  return CONDITION_SEVERITY_BANDS[Math.max(0, Math.min(CONDITION_SEVERITY_BANDS.length - 1, index))];
}

function isBand(value: unknown): value is ConditionSeverityBand {
  return CONDITION_SEVERITY_BANDS.includes(value as ConditionSeverityBand);
}

function conditionKey(value: string) {
  const key = normalize(value);
  if (key === 'gerd' || key.includes('acid reflux') || key.includes('reflux')) return 'gerd acid reflux';
  if (key === 'ibs' || key.includes('irritable bowel')) return 'ibs';
  return key;
}

function namesMatch(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aliases = new Set([...(INGREDIENT_ALIASES[a] ?? []), ...(INGREDIENT_ALIASES[b] ?? [])].map(normalize));
  return aliases.has(a) || aliases.has(b);
}

function extractedIngredientNames(structured: StructuredAnalysisV2) {
  return [
    ...structured.visibleIngredients.flatMap((i) => [i.rawName, i.canonicalName]),
    ...structured.inferredIngredients.flatMap((i) => [i.rawName, i.canonicalName]),
  ].filter((value): value is string => Boolean(value));
}

export function evidenceCitationsFromChunks(chunks: RiskAdjudicationEvidenceChunk[]): EvidenceCitation[] {
  return chunks.slice(0, 5).map((chunk, index) => ({
    id: `cite-${index}`,
    title: chunk.title || 'Reference',
    source: chunk.source || 'reference',
    url: chunk.url ?? undefined,
    chunkId: chunk.chunkId,
    snippet: chunk.content.replace(/\s+/g, ' ').slice(0, 180),
    relevanceScore: chunk.relevanceScore,
  }));
}

export function buildPersonalRiskEvidence(
  structured: StructuredAnalysisV2,
  insights: IngredientInsight[],
): PersonalRiskEvidence[] {
  const scanIngredients = extractedIngredientNames(structured);
  const relevant = insights.filter((insight) => {
    if (insight.supportingEvidenceCount <= 0) return false;
    return scanIngredients.some((name) => namesMatch(name, insight.ingredientName));
  });

  return relevant.slice(0, 12).map((insight) => ({
    ingredientName: insight.ingredientName,
    combinedRiskScore: insight.combinedRiskScore,
    confidenceLevel: insight.confidenceLevel,
    supportingEvidenceCount: insight.supportingEvidenceCount,
    calmEvidenceCount: insight.positiveEvidenceCount,
    reactiveEvidenceCount: insight.negativeEvidenceCount,
    summary: insight.summary,
  }));
}

export function buildRiskAdjudicationRequest(params: {
  structuredAnalysis: StructuredAnalysisV2;
  profile: UserProfile | null;
  insights: IngredientInsight[];
  ragEvidence: RiskAdjudicationEvidenceChunk[];
}): RiskAdjudicationRequest {
  const knownConditions = params.profile?.knownConditions.length ? params.profile.knownConditions : ['general'];
  return {
    structuredAnalysis: params.structuredAnalysis,
    knownConditions,
    personalEvidence: buildPersonalRiskEvidence(params.structuredAnalysis, params.insights),
    ragEvidence: params.ragEvidence,
  };
}

export function fallbackRiskAdjudicationPayload(input: RiskAdjudicationRequest): RiskAdjudicationPayload {
  const existing = input.structuredAnalysis.conditionSeverities?.length
    ? input.structuredAnalysis.conditionSeverities
    : input.knownConditions.map((condition) => ({
        condition,
        band: 'mild' as const,
        drivers: [] as string[],
        rationale: 'Fallback condition band.',
      }));

  return {
    conditionSeverities: existing.map((entry) => ({
      condition: entry.condition,
      genericBand: entry.band,
      personalizedBand: entry.band,
      finalBand: entry.band,
      drivers: entry.drivers ?? [],
      protectiveEvidence: [],
      citationChunkIds: [],
      personalEvidenceUsed: [],
      confidence: 'low',
      rationale: entry.rationale ?? 'Fallback condition band.',
    })),
  };
}

function matchingPersonalEvidence(row: RawRiskAdjudicationCondition, evidence: PersonalRiskEvidence[]) {
  const text = [row.drivers, row.personalEvidenceUsed, row.protectiveEvidence].flat().join(' ');
  return evidence.filter((entry) => namesMatch(text, entry.ingredientName));
}

function allowedPersonalBandMove(row: RawRiskAdjudicationCondition, evidence: PersonalRiskEvidence[]) {
  const matches = matchingPersonalEvidence(row, evidence);
  if (!matches.length || !row.personalEvidenceUsed.length) return 0;
  if (matches.some((entry) => entry.confidenceLevel === 'high')) return 2;
  if (matches.some((entry) => entry.confidenceLevel === 'medium')) return 1;
  return 0;
}

function clampFinalBand(row: RawRiskAdjudicationCondition, personalEvidence: PersonalRiskEvidence[]) {
  const generic = bandIndex(row.genericBand);
  const final = bandIndex(row.finalBand);
  const allowedMove = allowedPersonalBandMove(row, personalEvidence);
  if (Math.abs(final - generic) <= allowedMove) return row.finalBand;
  return bandAt(generic + Math.sign(final - generic) * allowedMove);
}

function citationIdMap(chunks: RiskAdjudicationEvidenceChunk[]) {
  const map = new Map<string, string>();
  chunks.forEach((chunk, index) => {
    map.set(chunk.chunkId, chunk.chunkId);
    map.set(`cite-${index}`, chunk.chunkId);
  });
  return map;
}

export function validateRiskAdjudication(
  payload: RiskAdjudicationPayload,
  input: RiskAdjudicationRequest,
  options: { source: 'llm' | 'fallback'; ragRetrievalRunId?: string | null } = { source: 'llm' },
): ValidatedRiskAdjudication | null {
  if (!Array.isArray(payload.conditionSeverities)) return null;

  const allowedConditions = new Set(input.knownConditions.map(conditionKey));
  const allowedCitationIds = citationIdMap(input.ragEvidence);
  const allowedIngredients = extractedIngredientNames(input.structuredAnalysis);
  const warnings = new Set<string>();
  const metadataRows: RawRiskAdjudicationCondition[] = [];
  const conditionSeverities: ConditionSeverity[] = [];

  for (const raw of payload.conditionSeverities) {
    if (
      !raw ||
      typeof raw.condition !== 'string' ||
      !allowedConditions.has(conditionKey(raw.condition)) ||
      !isBand(raw.genericBand) ||
      !isBand(raw.personalizedBand) ||
      !isBand(raw.finalBand)
    ) {
      return null;
    }

    const rawCitationIds = (Array.isArray(raw.citationChunkIds) ? raw.citationChunkIds : []).map(String);
    const invalidCitationIds = rawCitationIds.filter((id) => !allowedCitationIds.has(id));
    if (invalidCitationIds.length) {
      warnings.add(`invalidCitationIdsDropped:${invalidCitationIds.join(',')}`);
    }
    const citationChunkIds = Array.from(
      new Set(rawCitationIds.flatMap((id) => allowedCitationIds.get(id) ?? [])),
    );

    const drivers = (Array.isArray(raw.drivers) ? raw.drivers : [])
      .map(String)
      .filter((driver) => allowedIngredients.some((name) => namesMatch(name, driver)))
      .slice(0, 6);

    const clampedFinalBand = clampFinalBand(raw, input.personalEvidence);

    const row: RawRiskAdjudicationCondition = {
      condition: raw.condition,
      genericBand: raw.genericBand,
      personalizedBand: raw.personalizedBand,
      finalBand: clampedFinalBand,
      drivers,
      protectiveEvidence: (Array.isArray(raw.protectiveEvidence) ? raw.protectiveEvidence : []).map(String).slice(0, 6),
      citationChunkIds,
      personalEvidenceUsed: (Array.isArray(raw.personalEvidenceUsed) ? raw.personalEvidenceUsed : []).map(String).slice(0, 6),
      confidence: raw.confidence === 'high' || raw.confidence === 'medium' ? raw.confidence : 'low',
      rationale: String(raw.rationale ?? '').slice(0, 600),
    };

    metadataRows.push(row);
    conditionSeverities.push({
      condition: row.condition,
      band: row.finalBand,
      drivers: row.drivers,
      rationale: row.rationale,
    });
  }

  return {
    conditionSeverities,
    metadata: {
      promptVersion: RISK_ADJUDICATION_PROMPT_VERSION,
      source: options.source,
      ragRetrievalRunId: options.ragRetrievalRunId ?? null,
      warnings: warnings.size ? [...warnings] : undefined,
      conditionSeverities: metadataRows,
    },
    evidenceCitations: evidenceCitationsFromChunks(
      input.ragEvidence.filter((chunk) =>
        metadataRows.some((row) => row.citationChunkIds.includes(chunk.chunkId)),
      ),
    ),
  };
}

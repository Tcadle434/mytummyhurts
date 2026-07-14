import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  IngredientInsight,
  MenuScanAnalysis,
  ScanResult,
  StructuredAnalysisV2,
  UserProfile,
} from '../engine/domain';
import type { ExtractionContext, OpenAiAuditLog } from '../engine/openai';
import { normalizeStructuredFoodFacts } from '../engine/foodFactNormalization';
import {
  buildRiskAdjudicationRequest,
  evidenceCitationsFromChunks,
  validateRiskAdjudication,
  type EvidenceCitation,
  type RiskAdjudicationEvidenceChunk,
} from '../engine/riskAdjudication';
import {
  computeMenuScanResultFromExtraction,
  computeScanResultFromStructured,
  toRiskLevel,
} from '../engine/scoring';
import { LLM_PROVIDER, LlmProvider } from '../../llm/llm-provider.interface';
import type { RankedCandidate } from '../../rag/reranker';
import { RagRetrievalService } from '../../rag/retrieval.service';
import { computeRagAdjustment, type RagSignal } from '../../rag/rag-influence';
import { buildRagSignals } from '../../rag/rag-signals';
import { adjudicationWorthwhile } from '../../rag/adjudication-worthwhile';
import {
  ingredientsPreviewFromExtraction,
  type ScanAnalysisStage,
  type ScanStageCallback,
  type ScanStageDetail,
} from '../scan-progress';
import { concernShadowEnabled } from '../concern-v1/config';
import { runConcernV1Shadow } from '../concern-v1/openai';
import type { ConcernV1ShadowRun } from '../concern-v1/domain';

export interface ScanWorkflowInput {
  userId: string;
  scanId?: string | null;
  kind: 'text' | 'image' | 'menu' | 'barcode';
  text?: string;
  imageUrls?: string[];
  imageUri?: string;
  scanCategory?: 'food' | 'menu' | 'grocery';
  autoClassify?: boolean;
  profile: UserProfile | null;
  insights: IngredientInsight[];
  context?: ExtractionContext;
  /** Display-only progress reporting; must never affect the analysis. */
  onStage?: ScanStageCallback;
}

export interface ScanWorkflowResult {
  scanCategory: 'food' | 'menu' | 'grocery';
  extraction: StructuredAnalysisV2 | MenuScanAnalysis;
  baseResult: ScanResult;
  finalResult: ScanResult;
  audits: OpenAiAuditLog[];
  concernV1Shadow?: Promise<ConcernV1ShadowRun>;
}

// Bounded RAG influence may nudge the overall score by at most this many points
// (before the band-cross guard clamps it further). Small by design: literature
// refines placement inside a band, it never overturns the engine's band.
const RAG_INFLUENCE_MAX_DELTA = 5;

/**
 * Deterministic LangGraph workflow for scan analysis. The graph is a fixed DAG —
 * branches depend only on input kind/category, never on model output. The LLM
 * only EXTRACTS; the numeric score comes from the deterministic engine. RAG
 * retrieval, conditional adjudication, and bounded influence are gated by
 * RAG_RETRIEVAL_ENABLED / SCAN_RISK_ADJUDICATION_ENABLED / RAG_INFLUENCE_ENABLED;
 * with all off the final result is byte-identical to the engine output.
 */
@Injectable()
export class ScanWorkflowService {
  private readonly graph: ReturnType<ScanWorkflowService['buildGraph']>;

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService,
    private readonly retrieval: RagRetrievalService,
  ) {
    this.graph = this.buildGraph();
  }

  private deriveContext(input: ScanWorkflowInput): ExtractionContext {
    if (input.context) return input.context;
    const profile = input.profile;
    return {
      knownConditions: profile?.knownConditions ?? [],
      knownIngredients: profile?.knownIngredientSensitivities ?? [],
      dietPreferences: profile?.dietPreferences,
      // Mechanism-only scoring discards extraction conditionSeverities, so do
      // not pay the extractor to produce them on that path (FOOD_LLM_BANDS in
      // the engine can also force this off globally).
      requestConditionBands: !this.flag('SCAN_MECHANISM_SCORING_V1_ENABLED', false),
    };
  }

  // Progress is display-only: a throwing (or missing) callback must never
  // break the deterministic graph.
  private notifyStage(input: ScanWorkflowInput, stage: ScanAnalysisStage, detail?: ScanStageDetail) {
    try {
      input.onStage?.(stage, detail);
    } catch {
      // Best-effort by design.
    }
  }

  private numberFlag(name: string, fallback: number) {
    const raw = this.config.get<string>(name);
    const parsed = Number(raw);
    return raw !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private flag(name: string, fallback = false) {
    const raw = this.config.get<string>(name);
    if (raw === undefined) return fallback;
    return raw === 'true' || raw === '1' || raw === 'on';
  }

  private supportsRiskAdjudication(scanCategory: 'food' | 'menu' | 'grocery' | undefined) {
    return scanCategory === 'food' || scanCategory === 'grocery';
  }

  private normalizeTerm(value: string | undefined | null) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractedIngredientTerms(extraction: StructuredAnalysisV2) {
    return Array.from(
      new Set(
        [...extraction.visibleIngredients, ...extraction.inferredIngredients]
          .flatMap((ingredient) => [ingredient.canonicalName, ingredient.rawName])
          .map((value) => this.normalizeTerm(value))
          .filter(Boolean),
      ),
    );
  }

  private conceptTerms(extraction: StructuredAnalysisV2, insights: IngredientInsight[]) {
    const ingredientTerms = this.extractedIngredientTerms(extraction);
    const terms = new Set<string>();
    if (extraction.baseFoodCategory?.key) terms.add(extraction.baseFoodCategory.key);
    if (extraction.baseFoodCategory?.source) terms.add(extraction.baseFoodCategory.source);
    for (const modifier of extraction.riskModifiers ?? []) {
      terms.add(modifier.key);
      terms.add(modifier.source);
    }
    for (const insight of insights) {
      const insightName = this.normalizeTerm(insight.ingredientName);
      const relevant = ingredientTerms.some(
        (term) => term === insightName || term.includes(insightName) || insightName.includes(term),
      );
      if (!relevant) continue;
      if (insight.taxonomy?.primaryFoodFamilyKey) terms.add(insight.taxonomy.primaryFoodFamilyKey);
      for (const pattern of insight.taxonomy?.digestivePatternKeys ?? []) terms.add(pattern);
    }
    return Array.from(terms).map((term) => this.normalizeTerm(term)).filter(Boolean);
  }

  // Matched influence signals: only chunks whose ingredient appears in the dish.
  // Pure; safe to call more than once (adjudication gate + applyEvidence).
  private buildSignals(
    extraction: StructuredAnalysisV2 | MenuScanAnalysis | null,
    ragEvidence: RiskAdjudicationEvidenceChunk[],
  ): RagSignal[] {
    if (!extraction || !ragEvidence.length) return [];
    return buildRagSignals(extraction as StructuredAnalysisV2, ragEvidence);
  }

  private toRagEvidence(chunks: RankedCandidate[]): RiskAdjudicationEvidenceChunk[] {
    return chunks.slice(0, 5).map((chunk) => ({
      chunkId: chunk.chunkId,
      title: chunk.title ?? 'Reference',
      source: chunk.source ?? 'reference',
      url: chunk.url,
      content: chunk.content,
      conditionTags: chunk.conditionTags ?? [],
      ingredientTags: chunk.ingredientTags ?? [],
      direction: chunk.direction,
      relevanceScore: chunk.rerankScore,
    }));
  }

  private buildGraph() {
    const State = Annotation.Root({
      input: Annotation<ScanWorkflowInput>(),
      context: Annotation<ExtractionContext>(),
      scanCategory: Annotation<'food' | 'menu' | 'grocery'>(),
      extraction: Annotation<StructuredAnalysisV2 | MenuScanAnalysis | null>(),
      baseResult: Annotation<ScanResult | null>(),
      finalResult: Annotation<ScanResult | null>(),
      ragRetrievalRunId: Annotation<string | null>(),
      ragEvidence: Annotation<RiskAdjudicationEvidenceChunk[]>({
        reducer: (_a, b) => b,
        default: () => [],
      }),
      // Matched (ingredient-in-dish) influence signals, computed in applyEvidence
      // and reused by finalize for matched-only citations.
      ragSignals: Annotation<RagSignal[]>({
        reducer: (_a, b) => b,
        default: () => [],
      }),
      evidenceCitations: Annotation<EvidenceCitation[]>({
        reducer: (_a, b) => b,
        default: () => [],
      }),
      audits: Annotation<OpenAiAuditLog[]>({
        reducer: (a, b) => a.concat(b),
        default: () => [],
      }),
    });
    type S = typeof State.State;

    const llm = this.llm;
    const config = this.config;

    return new StateGraph(State)
      .addNode('loadUserContext', (s: S) => ({ context: this.deriveContext(s.input) }))
      .addNode('generate', async (s: S) => {
        const { input, context } = s;
        this.notifyStage(input, 'reading_ingredients');
        let kind = input.kind;
        // Auto food/menu classification for images without an explicit category.
        if (kind === 'image' && input.autoClassify && (input.imageUrls?.length ?? 0) > 0) {
          try {
            const cls = await llm.classifyImages(input.imageUrls ?? []);
            if ((cls.result as { category?: string })?.category === 'menu') kind = 'menu';
          } catch {
            // fall back to single-food extraction
          }
        }
        if (kind === 'menu') {
          const r = await llm.extractMenu(input.imageUrls ?? [], context);
          return { extraction: r.result, scanCategory: 'menu' as const, audits: r.audits };
        }
        if (kind === 'image') {
          const r = await llm.extractImages(input.imageUrls ?? [], context);
          return {
            extraction: r.result,
            scanCategory: (input.scanCategory ?? 'food') as 'food' | 'grocery',
            audits: r.audits,
          };
        }
        // text + barcode both go through text extraction (barcode passes a
        // product description as `text`).
        const r = await llm.extractText(input.text ?? '', context);
        return {
          extraction: r.result,
          scanCategory: (input.scanCategory ?? 'food') as 'food' | 'grocery',
          audits: r.audits,
        };
      })
      .addNode('normalizeFoodFacts', (s: S) => {
        const { input, extraction, scanCategory } = s;
        // Extraction just finished: surface what was found while scoring runs.
        if (extraction) {
          this.notifyStage(input, 'scoring', {
            ingredientsPreview: ingredientsPreviewFromExtraction(extraction),
          });
        }
        if (!extraction || !this.supportsRiskAdjudication(scanCategory)) {
          return {};
        }
        return { extraction: normalizeStructuredFoodFacts(extraction as StructuredAnalysisV2) };
      })
      .addNode('retrieveEvidence', async (s: S) => {
        const { input, extraction, scanCategory } = s;
        const retrievalEnabled = this.flag('RAG_RETRIEVAL_ENABLED', false);
        if (!retrievalEnabled || !extraction || !this.supportsRiskAdjudication(scanCategory)) {
          return {};
        }
        const structured = extraction as StructuredAnalysisV2;
        try {
          const ingredients = this.extractedIngredientTerms(structured);
          const concepts = this.conceptTerms(structured, input.insights);
          const conditions = input.profile?.knownConditions ?? [];
          const { runId, chunks } = await this.retrieval.retrieve({
            ingredients,
            concepts,
            conditions,
            userId: input.userId,
            scanId: input.scanId ?? null,
          }, 5);
          return {
            ragRetrievalRunId: runId,
            ragEvidence: this.toRagEvidence(chunks),
          };
        } catch {
          return { ragRetrievalRunId: null, ragEvidence: [] };
        }
      })
      .addNode('adjudicateRisk', async (s: S) => {
        const { input, extraction, scanCategory } = s;
        if (this.flag('SCAN_MECHANISM_SCORING_V1_ENABLED', false)) {
          return {};
        }
        // D1 wiring: when enabled, the adjudicator's clamped finalBands REPLACE
        // extraction.conditionSeverities before scoring — adjudication is the
        // band source, extraction bands are its prior (see the adjudication
        // user prompt). Default OFF (Phase 2 decision): adjudication only earns
        // its extra call when medium/high-confidence personal evidence or RAG
        // citations exist to move a band; without them it re-derives the
        // generic band a second time for ~2x hot-path LLM latency/cost. Enable
        // once learned insights + the RAG corpus are populated in prod.
        const enabled = this.flag('SCAN_RISK_ADJUDICATION_ENABLED', false);
        if (!enabled || !extraction || !this.supportsRiskAdjudication(scanCategory)) {
          return {};
        }
        const structured = extraction as StructuredAnalysisV2;
        // Conditional adjudication (Phase 2 decision): only pay for the second
        // LLM round-trip when there is real personal evidence or matched
        // literature to weigh. Cold-start scans keep the fast path — their score
        // still comes from extraction bands + deterministic placement.
        const signals = this.buildSignals(structured, s.ragEvidence ?? []);
        if (!adjudicationWorthwhile(input.insights, structured, signals)) {
          return {};
        }
        const request = buildRiskAdjudicationRequest({
          structuredAnalysis: structured,
          profile: input.profile,
          insights: input.insights,
          ragEvidence: s.ragEvidence ?? [],
        });
        try {
          const adjudication = await llm.adjudicateScanRisk(request);
          const validated = validateRiskAdjudication(adjudication.result, request, {
            source: adjudication.audits.length ? 'llm' : 'fallback',
            ragRetrievalRunId: s.ragRetrievalRunId ?? null,
          });
          if (!validated) {
            return { audits: adjudication.audits };
          }
          return {
            extraction: {
              ...structured,
              conditionSeverities: validated.conditionSeverities,
              riskAdjudication: validated.metadata,
              ragRetrievalRunId: s.ragRetrievalRunId ?? null,
              evidenceCitations: validated.evidenceCitations,
            },
            evidenceCitations: validated.evidenceCitations,
            audits: adjudication.audits,
          };
        } catch (err) {
          const audit = err && typeof err === 'object' && 'audit' in err ? (err as { audit?: OpenAiAuditLog }).audit : null;
          return audit ? { audits: [audit] } : {};
        }
      })
      .addNode('score', (s: S) => {
        const { input, extraction, scanCategory } = s;
        if (!extraction) throw new Error('no_extraction');
        const baseResult =
          scanCategory === 'menu'
            ? computeMenuScanResultFromExtraction(
                extraction as MenuScanAnalysis,
                input.profile,
                input.insights,
                input.imageUri,
              )
            : computeScanResultFromStructured(
                extraction as StructuredAnalysisV2,
                input.profile,
                input.insights,
                input.imageUri,
                { mechanismScoringEnabled: this.flag('SCAN_MECHANISM_SCORING_V1_ENABLED', false) },
              );
        return { baseResult };
      })
      // Bounded RAG influence: literature may nudge the OVERALL score within its
      // band (never across — computeRagAdjustment enforces the guard). Off by
      // default (RAG_INFLUENCE_ENABLED); when off, baseResult passes through
      // untouched and finalize keeps its prior citation behavior.
      .addNode('applyEvidence', (s: S) => {
        const base = s.baseResult;
        if (!base) return {};
        const influenceEnabled = this.flag('RAG_INFLUENCE_ENABLED', false);
        const signals = influenceEnabled ? this.buildSignals(s.extraction, s.ragEvidence ?? []) : [];
        if (!influenceEnabled || signals.length === 0) {
          // Still record matched signals (empty here) so finalize is explicit.
          return { ragSignals: signals };
        }
        const adjustment = computeRagAdjustment(base.overallRiskScore, signals, {
          enabled: true,
          maxDelta: this.numberFlag('RAG_INFLUENCE_MAX_DELTA', RAG_INFLUENCE_MAX_DELTA),
        });
        if (!adjustment.applied || adjustment.finalScore === base.overallRiskScore) {
          return { ragSignals: signals };
        }
        // Nudge the overall score + level only. Per-condition bands are out of
        // scope for v1 (they keep their extraction/adjudication values).
        return {
          ragSignals: signals,
          baseResult: base,
          finalResult: {
            ...base,
            overallRiskScore: adjustment.finalScore,
            overallRiskLevel: toRiskLevel(adjustment.finalScore),
            structuredAnalysis: {
              ...base.structuredAnalysis,
              ragInfluence: {
                baseScore: adjustment.baseScore,
                finalScore: adjustment.finalScore,
                delta: adjustment.clampedDelta,
                bandGuardApplied: adjustment.bandGuardApplied,
                reason: adjustment.reason,
              },
            },
          },
        };
      })
      .addNode('finalize', (s: S) => {
        this.notifyStage(s.input, 'personalizing');
        // Prefer the influence-adjusted result from applyEvidence when present.
        const base = s.finalResult ?? s.baseResult;
        if (!base) return { finalResult: base };
        const influenceEnabled = this.flag('RAG_INFLUENCE_ENABLED', false);
        // Matched-signals citation filter (the CORE trust guarantee): when
        // influence is on, only chunks whose ingredient is actually in the dish
        // may ever be cited — never every retrieved chunk, and never an
        // adjudication-chosen chunk for an off-plate ingredient. A plain-rice
        // scan therefore shows no dairy/garlic citations regardless of which path
        // produced them.
        const matchedChunkIds = new Set((s.ragSignals ?? []).map((signal) => signal.chunkId));
        const matchedCitations = evidenceCitationsFromChunks(
          (s.ragEvidence ?? []).filter((chunk) => matchedChunkIds.has(chunk.chunkId)),
        );
        const citations = influenceEnabled
          ? // Adjudication citations survive only if they are matched; otherwise
            // show the full matched set (the "receipts" for what's on the plate).
            (s.evidenceCitations ?? []).filter((citation) => citation.chunkId && matchedChunkIds.has(citation.chunkId)).length
            ? (s.evidenceCitations ?? []).filter((citation) => citation.chunkId && matchedChunkIds.has(citation.chunkId))
            : matchedCitations
          : s.evidenceCitations?.length
            ? s.evidenceCitations
            : this.flag('SCAN_RISK_ADJUDICATION_ENABLED', false) || this.flag('SCAN_MECHANISM_SCORING_V1_ENABLED', false)
              ? evidenceCitationsFromChunks(s.ragEvidence ?? [])
              : [];
        const structuredAnalysis = {
          ...base.structuredAnalysis,
          ragRetrievalRunId: s.ragRetrievalRunId ?? base.structuredAnalysis.ragRetrievalRunId ?? null,
          evidenceCitations: citations,
        };
        return {
          finalResult: {
            ...base,
            evidenceCitations: citations,
            structuredAnalysis,
          },
        };
      })
      .addEdge(START, 'loadUserContext')
      .addEdge('loadUserContext', 'generate')
      .addEdge('generate', 'normalizeFoodFacts')
      .addEdge('normalizeFoodFacts', 'retrieveEvidence')
      .addEdge('retrieveEvidence', 'adjudicateRisk')
      .addEdge('adjudicateRisk', 'score')
      .addEdge('score', 'applyEvidence')
      .addEdge('applyEvidence', 'finalize')
      .addEdge('finalize', END)
      .compile();
  }

  async run(input: ScanWorkflowInput): Promise<ScanWorkflowResult> {
    const out = await this.graph.invoke({ input });
    const concernV1Shadow = concernShadowEnabled()
      ? runConcernV1Shadow({
          extraction: out.extraction!,
          profile: input.profile,
          insights: input.insights,
        })
      : undefined;
    return {
      scanCategory: out.scanCategory,
      extraction: out.extraction!,
      baseResult: out.baseResult!,
      finalResult: out.finalResult ?? out.baseResult!,
      audits: out.audits,
      concernV1Shadow,
    };
  }
}

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
} from '../engine/scoring';
import { LLM_PROVIDER, LlmProvider } from '../../llm/llm-provider.interface';
import type { RankedCandidate } from '../../rag/reranker';
import { RagRetrievalService } from '../../rag/retrieval.service';

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
}

export interface ScanWorkflowResult {
  scanCategory: 'food' | 'menu' | 'grocery';
  extraction: StructuredAnalysisV2 | MenuScanAnalysis;
  baseResult: ScanResult;
  finalResult: ScanResult;
  audits: OpenAiAuditLog[];
}

/**
 * Deterministic LangGraph workflow for scan analysis. The graph is a fixed DAG —
 * branches depend only on input kind/category, never on model output. The LLM
 * only EXTRACTS; the numeric score comes from the deterministic engine. The RAG
 * nodes are wired but no-op until Phase 7 enables them; with RAG off the final
 * result is byte-identical to the engine output.
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
    };
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
        const enabled = this.flag('SCAN_RISK_ADJUDICATION_ENABLED', false);
        if (!enabled || !extraction || !this.supportsRiskAdjudication(scanCategory)) {
          return {};
        }
        const structured = extraction as StructuredAnalysisV2;
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
              );
        return { baseResult };
      })
      .addNode('finalize', (s: S) => {
        const base = s.baseResult;
        if (!base) return { finalResult: base };
        const citations =
          s.evidenceCitations?.length
            ? s.evidenceCitations
            : this.flag('SCAN_RISK_ADJUDICATION_ENABLED', false)
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
      .addEdge('generate', 'retrieveEvidence')
      .addEdge('retrieveEvidence', 'adjudicateRisk')
      .addEdge('adjudicateRisk', 'score')
      .addEdge('score', 'finalize')
      .addEdge('finalize', END)
      .compile();
  }

  async run(input: ScanWorkflowInput): Promise<ScanWorkflowResult> {
    const out = await this.graph.invoke({ input });
    return {
      scanCategory: out.scanCategory,
      extraction: out.extraction!,
      baseResult: out.baseResult!,
      finalResult: out.finalResult ?? out.baseResult!,
      audits: out.audits,
    };
  }
}

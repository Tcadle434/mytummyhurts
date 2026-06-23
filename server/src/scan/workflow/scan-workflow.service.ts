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
  computeMenuScanResultFromExtraction,
  computeScanResultFromStructured,
} from '../engine/scoring';
import { LLM_PROVIDER, LlmProvider } from '../../llm/llm-provider.interface';
import { computeRagAdjustment, RagSignal } from '../../rag/rag-influence';
import { RagRetrievalService } from '../../rag/retrieval.service';

export interface ScanWorkflowInput {
  userId: string;
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

  private bandLevel(score: number): 'low' | 'medium' | 'high' {
    return score < 37 ? 'low' : score < 64 ? 'medium' : 'high';
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

  private buildGraph() {
    const State = Annotation.Root({
      input: Annotation<ScanWorkflowInput>(),
      context: Annotation<ExtractionContext>(),
      scanCategory: Annotation<'food' | 'menu' | 'grocery'>(),
      extraction: Annotation<StructuredAnalysisV2 | MenuScanAnalysis | null>(),
      baseResult: Annotation<ScanResult | null>(),
      finalResult: Annotation<ScanResult | null>(),
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
      .addNode('ragAdjust', async (s: S) => {
        // Bounded within-band nudge. With influence disabled (default), the final
        // result is the engine result unchanged. Menus stay deterministic
        // pass-through in phase 1.
        const influenceEnabled = (config.get<string>('RAG_INFLUENCE_ENABLED') ?? 'false') === 'true';
        const retrievalEnabled = (config.get<string>('RAG_RETRIEVAL_ENABLED') ?? 'false') === 'true';
        const base = s.baseResult;
        if ((!influenceEnabled && !retrievalEnabled) || !base || s.scanCategory === 'menu') {
          return { finalResult: base };
        }
        const maxDelta = Number(config.get('RAG_INFLUENCE_MAX_DELTA') ?? 5);

        try {
          const ingredientNames = (base.ingredientRisks ?? []).map((i) => i.canonicalName);
          const conditions = s.input.profile?.knownConditions ?? [];
          const { chunks } = await this.retrieval.retrieve({
            ingredients: ingredientNames,
            conditions,
            userId: s.input.userId,
          });
          if (!chunks.length) return { finalResult: base };

          // Citations surfaced to the UI (additive EvidenceCitation[]).
          const evidenceCitations = chunks.slice(0, 5).map((c, i) => ({
            id: `cite-${i}`,
            title: c.title ?? 'Reference',
            source: c.source ?? 'reference',
            url: c.url ?? undefined,
            chunkId: c.chunkId,
            snippet: (c.content ?? '').replace(/\s+/g, ' ').slice(0, 180),
            relevanceScore: c.rerankScore,
          }));
          const sources = [...new Set(evidenceCitations.map((c) => c.source))].slice(0, 2).join(', ');
          const interpretation = sources
            ? `${base.interpretation ?? ''} Evidence drawn from ${sources}.`.trim()
            : base.interpretation;

          // Bounded within-band nudge — only when influence is enabled; otherwise
          // citations are attached without changing the score.
          let overallRiskScore = base.overallRiskScore;
          let overallRiskLevel = base.overallRiskLevel;
          if (influenceEnabled) {
            const signals: RagSignal[] = chunks
              .map((c): RagSignal | null => {
                const matched = c.ingredientTags.find((t) =>
                  ingredientNames.some((n) => n.toLowerCase().includes(t.toLowerCase())),
                );
                if (!matched || !c.direction) return null;
                return {
                  chunkId: c.chunkId,
                  source: c.source ?? 'reference',
                  title: c.title ?? '',
                  direction: c.direction,
                  relevance: c.rerankScore,
                  confidence: 'medium' as const,
                  matchedIngredient: matched,
                };
              })
              .filter((x): x is RagSignal => x !== null);
            const adj = computeRagAdjustment(base.overallRiskScore, signals, { enabled: true, maxDelta });
            overallRiskScore = adj.finalScore;
            overallRiskLevel = this.bandLevel(adj.finalScore);
          }

          return {
            finalResult: { ...base, overallRiskScore, overallRiskLevel, interpretation, evidenceCitations },
          };
        } catch {
          // Retrieval/influence is best-effort — never fail or alter a scan on error.
          return { finalResult: base };
        }
      })
      .addEdge(START, 'loadUserContext')
      .addEdge('loadUserContext', 'generate')
      .addEdge('generate', 'score')
      .addEdge('score', 'ragAdjust')
      .addEdge('ragAdjust', END)
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

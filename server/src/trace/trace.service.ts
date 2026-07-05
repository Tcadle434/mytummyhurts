import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { estimateOpenAiCost } from '../scan/engine/openaiPricing';
import {
  CLASSIFICATION_MODEL,
  EXTRACTION_MODEL,
  EXTRACTION_SCHEMA_VERSION,
  MENU_EXTRACTION_MODEL,
  PROMPT_VERSION,
  RISK_ADJUDICATION_MODEL,
  type OpenAiAuditLog,
} from '../scan/engine/openai';
import { RISK_ADJUDICATION_PROMPT_VERSION } from '../scan/engine/riskAdjudication';
import { LangsmithScanForwarder } from './langsmith-forwarder';

export const WORKFLOW_VERSION = 'scan_workflow_v1';
const GRAPH_NODES = [
  'loadUserContext',
  'generate',
  'normalizeFoodFacts',
  'retrieveEvidence',
  'adjudicateRisk',
  'score',
  'finalize',
];

export interface ScanTraceInput {
  userId: string;
  scanId: string;
  requestId?: string | null;
  operation: string;
  promptVersion: string;
  scanCategory: string;
  baseScore: number;
  finalScore: number;
  ragSummary?: unknown;
  audits: OpenAiAuditLog[];
  status?: 'completed' | 'failed';
}

/**
 * Writes per-run observability: ai_traces (one per scan), ai_node_traces (one per
 * LLM stage), ai_cost_events (the billable cost ledger). Best-effort — a trace
 * failure never blocks or alters a scan. LangSmith is flag-gated; the DB traces
 * are the source of truth.
 */
@Injectable()
export class TraceService {
  private readonly logger = new Logger('Trace');
  private versionsEnsured = false;
  // Plain member (not DI) — it has no dependencies beyond env, and keeping it
  // out of the module graph means test harnesses constructing TraceService
  // directly are unaffected.
  private readonly langsmith = new LangsmithScanForwarder();

  constructor(private readonly db: DatabaseService) {}

  async recordScanTrace(input: ScanTraceInput): Promise<string | null> {
    // Best-effort mirror to LangSmith before the DB write so a DB failure
    // cannot suppress the trace either. Fire-and-forget, never throws.
    this.langsmith.forward(input);
    try {
      await this.ensureVersions();
      return await this.db.service(async (sql) => {
        const totalCost = input.audits.reduce((t, a) => t + (a.estimatedCostUsdMicros ?? 0), 0);
        const totalLatency = input.audits.reduce((t, a) => t + (a.latencyMs ?? 0), 0);
        const [trace] = await sql`
          insert into public.ai_traces
            (user_id, scan_id, operation, workflow_version, prompt_version, scan_category, status,
             total_latency_ms, total_cost_usd_micros, base_score, final_score, rag_summary, completed_at)
          values (${input.userId}, ${input.scanId}, ${input.operation}, ${WORKFLOW_VERSION},
                  ${input.promptVersion}, ${input.scanCategory}, ${input.status ?? 'completed'},
                  ${totalLatency}, ${totalCost}, ${input.baseScore}, ${input.finalScore},
                  ${input.ragSummary ? sql.json(input.ragSummary as never) : null}, now())
          returning id`;

        let seq = 0;
        for (const a of input.audits) {
          const jsonSchema = a.jsonSchema == null ? null : sql.json(a.jsonSchema as never);
          const rawResponseJson = a.rawResponseJson == null ? null : sql.json(a.rawResponseJson as never);
          const parsedResponseJson =
            a.parsedResponseJson == null ? null : sql.json(a.parsedResponseJson as never);
          const normalizedResponseJson =
            a.normalizedResponseJson == null ? null : sql.json(a.normalizedResponseJson as never);
          const [audit] = await sql`
            insert into public.scan_ai_audit_logs
              (scan_id, user_id, request_id, stage, provider, model, prompt_version, schema_version,
               system_prompt, user_prompt, json_schema, request_metadata, input_refs,
               raw_response_text, raw_response_json, parsed_response_json, normalized_response_json,
               status, error_code, error_message, latency_ms, openai_response_id, input_tokens,
               cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
               estimated_cost_usd_micros, pricing_snapshot, billable)
            values (${input.scanId}, ${input.userId}, ${input.requestId ?? null}, ${a.stage}, ${a.provider ?? 'openai'},
                    ${a.model ?? null}, ${a.promptVersion ?? input.promptVersion}, ${a.schemaVersion ?? null},
                    ${a.systemPrompt ?? null}, ${a.userPrompt ?? null},
                    ${jsonSchema},
                    ${sql.json((a.requestMetadata ?? {}) as never)},
                    ${sql.json((a.inputRefs ?? []) as never)},
                    ${a.rawResponseText ?? null},
                    ${rawResponseJson},
                    ${parsedResponseJson},
                    ${normalizedResponseJson},
                    ${a.status}, ${a.errorCode ?? null}, ${a.errorMessage ?? null},
                    ${a.latencyMs ?? null}, ${a.openaiResponseId ?? null}, ${a.inputTokens ?? null},
                    ${a.cachedInputTokens ?? null}, ${a.outputTokens ?? null},
                    ${a.reasoningTokens ?? null}, ${a.totalTokens ?? null},
                    ${a.estimatedCostUsdMicros ?? 0}, ${sql.json((a.pricingSnapshot ?? {}) as never)},
                    ${a.billable ?? true})
            returning id`;
          const [node] = await sql`
            insert into public.ai_node_traces (trace_id, node_name, seq, status, latency_ms, output_snapshot, audit_log_id)
            values (${trace.id}, ${a.stage}, ${seq++}, ${a.status}, ${a.latencyMs ?? null},
                    ${sql.json({ model: a.model, totalTokens: a.totalTokens ?? null } as never)},
                    ${audit.id})
            returning id`;
          if (a.billable !== false && (a.totalTokens ?? 0) > 0) {
            await sql`
              insert into public.ai_cost_events
                (trace_id, node_trace_id, user_id, operation, provider, model, input_tokens,
                 cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
                 estimated_cost_usd_micros, pricing_snapshot, billable)
              values (${trace.id}, ${node.id}, ${input.userId}, ${a.stage}, 'openai', ${a.model},
                      ${a.inputTokens ?? null}, ${a.cachedInputTokens ?? null}, ${a.outputTokens ?? null},
                      ${a.reasoningTokens ?? null}, ${a.totalTokens ?? null},
                      ${a.estimatedCostUsdMicros ?? 0}, ${sql.json((a.pricingSnapshot ?? {}) as never)}, true)`;
          }
        }
        return trace.id as string;
      });
    } catch (err) {
      this.logger.warn(`trace write failed (non-fatal): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Ledger row for a standalone embedding call (RAG retrieval/ingestion).
   * These run outside any scan trace, so trace_id/node_trace_id stay null;
   * userId is recorded when the caller has one. Best-effort like all traces.
   */
  async recordEmbeddingCostEvent(input: {
    model: string;
    inputTokens: number | null;
    totalTokens: number | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      const snapshot = estimateOpenAiCost(input.model, {
        responseId: null,
        inputTokens: input.inputTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: input.totalTokens ?? input.inputTokens,
      });
      if (!snapshot.billable) return;
      await this.db.service(async (sql) => {
        await sql`
          insert into public.ai_cost_events
            (user_id, operation, provider, model, input_tokens, output_tokens,
             total_tokens, estimated_cost_usd_micros, pricing_snapshot, billable)
          values (${input.userId ?? null}, 'embedding', 'openai', ${input.model},
                  ${snapshot.usage.inputTokens}, 0, ${snapshot.usage.totalTokens},
                  ${snapshot.estimatedCostUsdMicros ?? 0},
                  ${sql.json(snapshot.pricingSnapshot as never)}, true)`;
      });
    } catch (err) {
      this.logger.warn(`embedding cost event write failed (non-fatal): ${(err as Error).message}`);
    }
  }

  private async ensureVersions(): Promise<void> {
    if (this.versionsEnsured) return;
    this.versionsEnsured = true;
    await this.db
      .service(async (sql) => {
        await sql`
          insert into public.workflow_version (workflow_version, graph_node_list)
          values (${WORKFLOW_VERSION}, ${sql.json(GRAPH_NODES as never)})
          on conflict (workflow_version) do nothing`;
        await sql`
          insert into public.ai_prompt_versions (prompt_key, version, schema_version)
          values ('mytummyhurts_extract', ${PROMPT_VERSION}, ${EXTRACTION_SCHEMA_VERSION})
          on conflict (prompt_key, version) do nothing`;
        await sql`
          insert into public.ai_prompt_versions (prompt_key, version, schema_version)
          values ('mytummyhurts_risk_adjudication', ${RISK_ADJUDICATION_PROMPT_VERSION}, 'risk_adjudication_v1')
          on conflict (prompt_key, version) do nothing`;
        for (const [role, model] of [
          ['extraction', EXTRACTION_MODEL],
          ['menu', MENU_EXTRACTION_MODEL],
          ['classification', CLASSIFICATION_MODEL],
          ['risk_adjudication', RISK_ADJUDICATION_MODEL],
          ['embedding', process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small'],
        ] as const) {
          const kind = role === 'embedding' ? 'embedding' : 'llm';
          await sql`
            insert into public.ai_model_versions (provider, model, kind)
            values ('openai', ${model}, ${kind})
            on conflict (provider, model) do nothing`;
        }
      })
      .catch(() => {
        this.versionsEnsured = false;
      });
  }
}

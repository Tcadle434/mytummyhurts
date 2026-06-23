import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { OpenAiAuditLog } from '../scan/engine/openai';

export const WORKFLOW_VERSION = 'scan_workflow_v1';
const GRAPH_NODES = [
  'loadUserContext',
  'generate',
  'score',
  'ragAdjust',
];

export interface ScanTraceInput {
  userId: string;
  scanId: string;
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

  constructor(private readonly db: DatabaseService) {}

  async recordScanTrace(input: ScanTraceInput): Promise<string | null> {
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
          const [node] = await sql`
            insert into public.ai_node_traces (trace_id, node_name, seq, status, latency_ms, output_snapshot)
            values (${trace.id}, ${a.stage}, ${seq++}, ${a.status}, ${a.latencyMs ?? null},
                    ${sql.json({ model: a.model, totalTokens: a.totalTokens ?? null } as never)})
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
          values ('mytummyhurts_extract', ${process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'mytummyhurts_extract_v3'}, 'meal_extraction_v2')
          on conflict (prompt_key, version) do nothing`;
        for (const [role, model] of [
          ['extraction', process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini'],
          ['menu', process.env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini'],
          ['normalization', process.env.OPENAI_NORMALIZATION_MODEL ?? 'gpt-4.1-mini'],
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

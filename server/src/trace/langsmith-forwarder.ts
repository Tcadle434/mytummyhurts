import { Logger } from '@nestjs/common';
import { RunTree } from 'langsmith';

import type { OpenAiAuditLog } from '../scan/engine/openai';
import type { ScanTraceInput } from './trace.service';

// Forwards every scan's audit trail to LangSmith as a run tree: one parent
// chain run per scan, one child llm run per pipeline stage — full prompts,
// responses, tokens, cost, and latency, so "what did the model actually say?"
// is answerable from the LangSmith UI instead of psql. Postgres audit tables
// remain the source of truth; forwarding is best-effort and can never fail,
// slow, or alter a scan.
//
// Gated on LANGSMITH_TRACING=true + LANGSMITH_API_KEY. Project comes from
// LANGSMITH_PROJECT (default MyTummyHurts).

export type LangsmithChildRunPayload = {
  name: string;
  runType: 'llm';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  metadata: Record<string, unknown>;
  error?: string;
  startTimeMs: number;
  endTimeMs: number;
};

export type LangsmithScanRunPayload = {
  name: string;
  runType: 'chain';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  metadata: Record<string, unknown>;
  error?: string;
  startTimeMs: number;
  endTimeMs: number;
  children: LangsmithChildRunPayload[];
};

function childFromAudit(
  audit: OpenAiAuditLog,
  startTimeMs: number,
): LangsmithChildRunPayload {
  const latency = Math.max(0, audit.latencyMs ?? 0);
  return {
    name: audit.stage,
    runType: 'llm',
    inputs: {
      systemPrompt: audit.systemPrompt,
      userPrompt: audit.userPrompt,
    },
    outputs: {
      parsed: audit.parsedResponseJson ?? audit.rawResponseText ?? null,
    },
    metadata: {
      model: audit.model,
      promptVersion: audit.promptVersion,
      schemaVersion: audit.schemaVersion,
      status: audit.status,
      inputTokens: audit.inputTokens ?? null,
      cachedInputTokens: audit.cachedInputTokens ?? null,
      outputTokens: audit.outputTokens ?? null,
      reasoningTokens: audit.reasoningTokens ?? null,
      estimatedCostUsdMicros: audit.estimatedCostUsdMicros ?? null,
      latencyMs: latency,
      openaiResponseId: audit.openaiResponseId ?? null,
    },
    error: audit.status === 'failed' ? (audit.errorMessage ?? audit.errorCode ?? 'failed') : undefined,
    startTimeMs,
    endTimeMs: startTimeMs + latency,
  };
}

/** Pure payload builder — unit-testable without the SDK or network. */
export function buildScanTracePayload(
  input: ScanTraceInput,
  nowMs: number,
): LangsmithScanRunPayload {
  const totalLatency = input.audits.reduce((total, audit) => total + Math.max(0, audit.latencyMs ?? 0), 0);
  const totalCost = input.audits.reduce((total, audit) => total + (audit.estimatedCostUsdMicros ?? 0), 0);
  const startTimeMs = nowMs - totalLatency;

  const children: LangsmithChildRunPayload[] = [];
  let cursor = startTimeMs;
  for (const audit of input.audits) {
    const child = childFromAudit(audit, cursor);
    children.push(child);
    cursor = child.endTimeMs;
  }

  const failed = input.status === 'failed';
  const shadowOutput = input.ragSummary === undefined
    ? {}
    : { concernV1Shadow: input.ragSummary };
  return {
    name: `scan/${input.scanCategory}`,
    runType: 'chain',
    inputs: {
      scanId: input.scanId,
      requestId: input.requestId ?? null,
      scanCategory: input.scanCategory,
      operation: input.operation,
    },
    outputs: failed
      ? { status: 'failed', ...shadowOutput }
      : {
          status: 'completed',
          baseScore: input.baseScore,
          finalScore: input.finalScore,
          ...shadowOutput,
        },
    metadata: {
      userId: input.userId,
      operation: input.operation,
      promptVersion: input.promptVersion,
      totalLatencyMs: totalLatency,
      totalCostUsdMicros: totalCost,
      stages: input.audits.map((audit) => audit.stage),
    },
    error: failed
      ? input.operation === 'scan_concern_shadow' ? 'concern_shadow_failed' : 'scan_failed'
      : undefined,
    startTimeMs,
    endTimeMs: nowMs,
    children,
  };
}

export class LangsmithScanForwarder {
  private readonly logger = new Logger('LangsmithForwarder');
  private warnedOnce = false;

  get enabled(): boolean {
    return (
      (process.env.LANGSMITH_TRACING ?? '').toLowerCase() === 'true' &&
      Boolean(process.env.LANGSMITH_API_KEY)
    );
  }

  private get projectName(): string {
    return process.env.LANGSMITH_PROJECT || 'MyTummyHurts';
  }

  /** Fire-and-forget: kicks off the upload and returns immediately. */
  forward(input: ScanTraceInput): void {
    if (!this.enabled || !input.audits.length) return;
    const payload = buildScanTracePayload(input, Date.now());
    void this.upload(payload).catch((error: unknown) => {
      if (!this.warnedOnce) {
        this.warnedOnce = true;
        this.logger.warn(
          `LangSmith forwarding failed (will keep retrying silently on future scans): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  }

  private async upload(payload: LangsmithScanRunPayload): Promise<void> {
    const parent = new RunTree({
      name: payload.name,
      run_type: payload.runType,
      inputs: payload.inputs,
      project_name: this.projectName,
      start_time: payload.startTimeMs,
      extra: { metadata: payload.metadata },
    });
    await parent.postRun();

    for (const child of payload.children) {
      const childRun = parent.createChild({
        name: child.name,
        run_type: child.runType,
        inputs: child.inputs,
        start_time: child.startTimeMs,
        extra: { metadata: child.metadata },
      });
      await childRun.postRun();
      childRun.end(child.outputs, child.error, child.endTimeMs);
      await childRun.patchRun();
    }

    parent.end(payload.outputs, payload.error, payload.endTimeMs);
    await parent.patchRun();
  }
}

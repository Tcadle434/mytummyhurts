import { describe, expect, it } from 'vitest';

import { buildScanTracePayload } from '../src/trace/langsmith-forwarder';
import type { OpenAiAuditLog } from '../src/scan/engine/openai';
import type { ScanTraceInput } from '../src/trace/trace.service';

function audit(overrides: Partial<OpenAiAuditLog> = {}): OpenAiAuditLog {
  return {
    stage: 'food_image_extraction',
    provider: 'openai',
    model: 'gpt-5.4-mini',
    promptVersion: 'mytummyhurts_extract_v4',
    schemaVersion: 'meal_extraction_v3',
    systemPrompt: 'system prompt text',
    userPrompt: 'user prompt text',
    jsonSchema: {},
    requestMetadata: {},
    inputRefs: [],
    rawResponseText: '{"dishName":"rice"}',
    rawResponseJson: {},
    parsedResponseJson: { dishName: 'rice' },
    status: 'completed',
    latencyMs: 4000,
    inputTokens: 1200,
    outputTokens: 300,
    estimatedCostUsdMicros: 5200,
    ...overrides,
  };
}

function traceInput(overrides: Partial<ScanTraceInput> = {}): ScanTraceInput {
  return {
    userId: 'user-1',
    scanId: 'scan-1',
    requestId: 'req-1',
    operation: 'scan_image',
    promptVersion: 'mytummyhurts_extract_v4',
    scanCategory: 'food',
    baseScore: 40,
    finalScore: 42,
    audits: [audit()],
    status: 'completed',
    ...overrides,
  };
}

describe('buildScanTracePayload', () => {
  it('builds a parent chain run with one llm child per audit', () => {
    const now = 1_000_000;
    const payload = buildScanTracePayload(
      traceInput({
        audits: [
          audit({ stage: 'food_image_extraction', latencyMs: 4000 }),
          audit({ stage: 'risk_adjudication', model: 'gpt-5-mini', latencyMs: 2000 }),
        ],
      }),
      now,
    );

    expect(payload.name).toBe('scan/food');
    expect(payload.runType).toBe('chain');
    // Parent window spans the summed stage latency ending at now.
    expect(payload.startTimeMs).toBe(now - 6000);
    expect(payload.endTimeMs).toBe(now);
    expect(payload.outputs).toEqual({ status: 'completed', baseScore: 40, finalScore: 42 });
    expect(payload.metadata.stages).toEqual(['food_image_extraction', 'risk_adjudication']);

    expect(payload.children).toHaveLength(2);
    const [extraction, adjudication] = payload.children;
    expect(extraction!.inputs.systemPrompt).toBe('system prompt text');
    expect(extraction!.outputs.parsed).toEqual({ dishName: 'rice' });
    expect(extraction!.metadata.model).toBe('gpt-5.4-mini');
    // Children tile the parent window back-to-back.
    expect(extraction!.startTimeMs).toBe(now - 6000);
    expect(extraction!.endTimeMs).toBe(now - 2000);
    expect(adjudication!.startTimeMs).toBe(now - 2000);
    expect(adjudication!.endTimeMs).toBe(now);
  });

  it('marks failed scans and failed stages with errors', () => {
    const payload = buildScanTracePayload(
      traceInput({
        status: 'failed',
        audits: [
          audit({
            status: 'failed',
            errorCode: 'openai_timeout',
            errorMessage: 'timed out',
            parsedResponseJson: null,
            rawResponseText: null,
          }),
        ],
      }),
      1_000_000,
    );

    expect(payload.error).toBe('scan_failed');
    expect(payload.outputs).toEqual({ status: 'failed' });
    expect(payload.children[0]!.error).toBe('timed out');
    expect(payload.children[0]!.outputs.parsed).toBeNull();
  });
});

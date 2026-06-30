import { ConfigModule } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module';
import type { OpenAiAuditLog } from '../src/scan/engine/openai';
import { TraceModule } from '../src/trace/trace.module';
import { TraceService } from '../src/trace/trace.service';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });
const U = '77777777-7777-7777-7777-777777777777';
const SCAN = '77777777-7777-7777-7777-777777777778';

let traces: TraceService;
let moduleRef: TestingModule;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, TraceModule],
  }).compile();
  traces = moduleRef.get(TraceService);

  await admin`delete from public.ai_traces where scan_id = ${SCAN}`;
  await admin`delete from public.scan_ai_audit_logs where scan_id = ${SCAN}`;
  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'trace-audit@test.dev', 'active', 40)`;
  await admin`insert into public.scans
    (id, user_id, source_type, scan_category, analysis_status, title, overall_risk_score,
     overall_risk_level, request_id)
    values (${SCAN}, ${U}, 'manual_text', 'food', 'completed', 'trace audit meal', 42,
      'medium', 'trace-request-1')`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await moduleRef?.close();
  await admin.end();
});

describe('TraceService audit persistence', () => {
  it('writes full OpenAI prompt and response audit rows and links node traces', async () => {
    const audit: OpenAiAuditLog = {
      stage: 'food_text_extraction',
      provider: 'openai',
      model: 'gpt-test',
      promptVersion: 'prompt-test',
      schemaVersion: 'schema-test',
      systemPrompt: 'SYSTEM PROMPT CONTENT',
      userPrompt: 'USER PROMPT CONTENT',
      jsonSchema: { type: 'object', properties: { dishName: { type: 'string' } } },
      requestMetadata: { source: 'test' },
      inputRefs: [{ inputKind: 'text' }],
      rawResponseText: '{"dishName":"rice"}',
      rawResponseJson: { output_text: '{"dishName":"rice"}' },
      parsedResponseJson: { dishName: 'rice' },
      normalizedResponseJson: { dishName: 'rice', visibleIngredients: [] },
      status: 'completed',
      latencyMs: 123,
      openaiResponseId: 'resp_test',
      inputTokens: 10,
      cachedInputTokens: 1,
      outputTokens: 5,
      reasoningTokens: 0,
      totalTokens: 15,
      estimatedCostUsdMicros: 42,
      pricingSnapshot: { model: 'gpt-test' },
      billable: true,
    };

    const traceId = await traces.recordScanTrace({
      userId: U,
      scanId: SCAN,
      requestId: 'trace-request-1',
      operation: 'scan_extract',
      promptVersion: 'prompt-test',
      scanCategory: 'food',
      baseScore: 42,
      finalScore: 42,
      audits: [audit],
    });

    expect(traceId).toBeTruthy();

    const [row] = await admin`
      select id, scan_id, user_id, request_id, stage, model, system_prompt, user_prompt,
             raw_response_text, raw_response_json, parsed_response_json,
             normalized_response_json, openai_response_id, total_tokens
      from public.scan_ai_audit_logs
      where scan_id = ${SCAN}
      order by created_at desc
      limit 1`;
    expect(row).toMatchObject({
      scan_id: SCAN,
      user_id: U,
      request_id: 'trace-request-1',
      stage: 'food_text_extraction',
      model: 'gpt-test',
      system_prompt: 'SYSTEM PROMPT CONTENT',
      user_prompt: 'USER PROMPT CONTENT',
      raw_response_text: '{"dishName":"rice"}',
      openai_response_id: 'resp_test',
      total_tokens: 15,
    });
    expect(row.raw_response_json).toMatchObject({ output_text: '{"dishName":"rice"}' });
    expect(row.parsed_response_json).toMatchObject({ dishName: 'rice' });
    expect(row.normalized_response_json).toMatchObject({ dishName: 'rice' });

    const [node] = await admin`
      select audit_log_id
      from public.ai_node_traces
      where trace_id = ${traceId}
      order by seq
      limit 1`;
    expect(node.audit_log_id).toBe(row.id);
  });
});

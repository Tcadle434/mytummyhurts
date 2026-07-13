// Low-level OpenAI Responses transport. Structured output is generated and
// parsed through the shared Zod-backed helper while the complete raw response
// envelope remains available for audits, usage, and cost accounting.

import type { z } from 'zod';
import {
  isRetryableOpenAiError,
  requestStructuredOutput,
  StructuredOutputError,
  type StructuredOutputAttempt,
  type StructuredOutputDefinition,
} from '../../llm/structured-output';
import { OPENAI_API_KEY, OPENAI_TIMEOUT_MS, PROMPT_VERSION } from './openaiConfig';
import {
  aggregateOpenAiCostSnapshots,
  estimateOpenAiCost,
  estimateOpenAiRetryCost,
  extractOpenAiUsage,
  type OpenAiCostSnapshot,
} from './openaiPricing';
import type { OpenAiAuditLog, ResponseAuditDescriptor } from './openaiTypes';

export function openAiCostFieldsFromSnapshot(snapshot: OpenAiCostSnapshot) {
  return {
    openaiResponseId: snapshot.usage.responseId,
    inputTokens: snapshot.usage.inputTokens,
    cachedInputTokens: snapshot.usage.cachedInputTokens,
    outputTokens: snapshot.usage.outputTokens,
    reasoningTokens: snapshot.usage.reasoningTokens,
    totalTokens: snapshot.usage.totalTokens,
    estimatedCostUsdMicros: snapshot.estimatedCostUsdMicros,
    pricingSnapshot: snapshot.pricingSnapshot,
    billable: snapshot.billable,
  };
}

export function openAiCostSnapshotFromAudit(audit: OpenAiAuditLog): OpenAiCostSnapshot {
  return {
    usage: {
      responseId: audit.openaiResponseId ?? null,
      inputTokens: audit.inputTokens ?? null,
      cachedInputTokens: audit.cachedInputTokens ?? null,
      outputTokens: audit.outputTokens ?? null,
      reasoningTokens: audit.reasoningTokens ?? null,
      totalTokens: audit.totalTokens ?? null,
    },
    pricingSnapshot: estimateOpenAiCost(audit.model, {
      responseId: audit.openaiResponseId ?? null,
      inputTokens: audit.inputTokens ?? null,
      cachedInputTokens: audit.cachedInputTokens ?? null,
      outputTokens: audit.outputTokens ?? null,
      reasoningTokens: audit.reasoningTokens ?? null,
      totalTokens: audit.totalTokens ?? null,
    }).pricingSnapshot,
    estimatedCostUsdMicros: audit.estimatedCostUsdMicros ?? null,
    billable: audit.billable ?? false,
  };
}

export function aggregateAuditCostSnapshot(model: string, audits: OpenAiAuditLog[]): OpenAiCostSnapshot {
  return aggregateOpenAiCostSnapshots(model, audits.map(openAiCostSnapshotFromAudit));
}

export function imageRefKind(url: string) {
  return url.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url';
}

function rawResponseJsonFromAttempts(attempts: StructuredOutputAttempt[]) {
  const responses = attempts
    .map((attempt) => attempt.rawResponseJson)
    .filter((response) => response !== null);
  if (responses.length <= 1) return responses[0] ?? null;
  return { attempts: responses };
}

function rawResponseTextFromAttempts(attempts: StructuredOutputAttempt[]) {
  const finalAttempt = attempts.at(-1);
  return finalAttempt?.outputText ?? finalAttempt?.rawResponseText ?? null;
}

function openAiCostSnapshotFromAttempts(model: string, attempts: StructuredOutputAttempt[]): OpenAiCostSnapshot {
  return estimateOpenAiRetryCost(
    model,
    attempts.map((attempt) => attempt.rawResponseJson),
  ) ?? estimateOpenAiCost(model, extractOpenAiUsage(null));
}

function structuredOutputRequestMetadata(
  metadata: Record<string, unknown>,
  attemptCount: number,
  validationIssues: { path: string; message: string }[],
) {
  return {
    ...metadata,
    attemptCount,
    validationIssues,
  };
}

async function runResponsesRequestWithAudit<TSchema extends z.ZodTypeAny>(
  input: Record<string, unknown>,
  definition: StructuredOutputDefinition<TSchema>,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
): Promise<{ parsed: z.infer<TSchema>; audit: OpenAiAuditLog }> {
  const completeAudit = {
    ...audit,
    requestMetadata: audit.requestMetadata ?? {},
    inputRefs: audit.inputRefs ?? [],
  };

  try {
    const result = await requestStructuredOutput({
      apiKey: OPENAI_API_KEY,
      stage: completeAudit.stage,
      request: input,
      definition,
      timeoutMs: options.timeoutMs ?? OPENAI_TIMEOUT_MS,
    });
    const costSnapshot = openAiCostSnapshotFromAttempts(completeAudit.model, result.attempts);
    return {
      parsed: result.value,
      audit: {
        ...completeAudit,
        provider: 'openai',
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        requestMetadata: structuredOutputRequestMetadata(
          completeAudit.requestMetadata,
          result.attemptCount,
          result.validationIssues,
        ),
        rawResponseText: rawResponseTextFromAttempts(result.attempts),
        rawResponseJson: rawResponseJsonFromAttempts(result.attempts),
        parsedResponseJson: result.value,
        status: 'completed',
        latencyMs: result.latencyMs,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      },
    };
  } catch (error) {
    const structured = error instanceof StructuredOutputError ? error : null;
    const attempts = structured?.attempts ?? [];
    const costSnapshot = openAiCostSnapshotFromAttempts(completeAudit.model, attempts);
    const failedAudit: OpenAiAuditLog = {
      ...completeAudit,
      provider: 'openai',
      promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
      requestMetadata: structuredOutputRequestMetadata(
        completeAudit.requestMetadata,
        structured?.attempts.length ?? 1,
        structured?.validationIssues ?? [],
      ),
      rawResponseText: rawResponseTextFromAttempts(attempts),
      rawResponseJson: rawResponseJsonFromAttempts(attempts),
      parsedResponseJson: null,
      status: 'failed',
      errorCode: structured?.code ?? 'openai_request_failed',
      errorMessage: structured?.validationIssues.length
        ? 'OpenAI structured output failed validation.'
        : error instanceof Error
          ? error.message
          : 'OpenAI request failed.',
      latencyMs: structured?.latencyMs ?? 0,
      ...openAiCostFieldsFromSnapshot(costSnapshot),
    };
    const throwable = error instanceof Error ? error : new Error('openai_request_failed');
    throw Object.assign(throwable, { audit: failedAudit });
  }
}

export function isTransientOpenAiError(error: unknown) {
  return isRetryableOpenAiError(error);
}

export async function runResponsesRequestWithAuditRetry<TSchema extends z.ZodTypeAny>(
  input: Record<string, unknown>,
  definition: StructuredOutputDefinition<TSchema>,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
) {
  return runResponsesRequestWithAudit(input, definition, audit, options);
}

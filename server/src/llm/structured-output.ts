import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { withRetry } from '../scan/engine/retry';
import { SAFE_STRUCTURED_OUTPUT_MESSAGES } from './structured-output-messages';

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 350;
const MAX_VALIDATION_ISSUES = 8;
const MAX_VALIDATION_MESSAGE_LENGTH = 180;

const RETRYABLE_OUTPUT_CODES = new Set([
  'openai_missing_output',
  'openai_incomplete_output',
  'openai_invalid_json',
  'openai_validation_failed',
]);
const RETRYABLE_RESPONSE_ERROR_CODES = new Set([
  'server_error',
  'rate_limit_exceeded',
  'vector_store_timeout',
]);

type RuntimeTextFormat = {
  type: 'json_schema';
  name: string;
  strict?: boolean | null;
  schema?: Record<string, unknown>;
  $parseRaw: (content: string) => unknown;
};

// The SDK helper's conditional Zod 3/Zod 4 generic is too deep for this
// project's TypeScript 5.6 checker when it is wrapped in another generic.
// Erase only that compile-time wrapper here; the returned value still parses
// with the exact schema supplied below.
const createZodTextFormat = zodTextFormat as unknown as (
  schema: z.ZodTypeAny,
  name: string,
) => RuntimeTextFormat;

export type StructuredOutputDefinition<TSchema extends z.ZodTypeAny> = {
  name: string;
  schema: TSchema;
  format: {
    type: 'json_schema';
    name: string;
    strict?: boolean | null;
    schema?: Record<string, unknown>;
    $parseRaw: (content: string) => z.infer<TSchema>;
  };
  jsonSchema: unknown;
  parse: (content: string) => z.infer<TSchema>;
};

export type SanitizedValidationIssue = {
  path: string;
  message: string;
};

export type StructuredOutputAttempt = {
  attempt: number;
  rawResponseText: string | null;
  rawResponseJson: unknown;
  outputText: string | null;
  latencyMs: number;
  errorCode?: string;
};

export type StructuredOutputResult<T> = {
  value: T;
  attempts: StructuredOutputAttempt[];
  attemptCount: number;
  validationIssues: SanitizedValidationIssue[];
  latencyMs: number;
};

type StructuredOutputErrorOptions = {
  code: string;
  message?: string;
  status?: number;
  retryable?: boolean;
  attempts: StructuredOutputAttempt[];
  validationIssues: SanitizedValidationIssue[];
  latencyMs: number;
  cause?: unknown;
};

const RETRYABILITY_OVERRIDES = new WeakMap<object, boolean>();

export class StructuredOutputError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly attempts: StructuredOutputAttempt[];
  readonly validationIssues: SanitizedValidationIssue[];
  readonly latencyMs: number;

  constructor(options: StructuredOutputErrorOptions) {
    super(options.message ?? options.code, { cause: options.cause });
    this.name = 'StructuredOutputError';
    this.code = options.code;
    this.status = options.status;
    if (options.retryable !== undefined) RETRYABILITY_OVERRIDES.set(this, options.retryable);
    this.attempts = options.attempts;
    this.validationIssues = options.validationIssues;
    this.latencyMs = options.latencyMs;
  }
}

export function defineStructuredOutput<TSchema extends z.ZodTypeAny>(
  name: string,
  schema: TSchema,
): StructuredOutputDefinition<TSchema> {
  const format = createZodTextFormat(schema, name);
  return {
    name,
    schema,
    format: format as StructuredOutputDefinition<TSchema>['format'],
    jsonSchema: format.schema,
    parse: (content) => format.$parseRaw(content) as z.infer<TSchema>,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content) || content.type !== 'output_text') continue;
      if (typeof content.text === 'string' && content.text.trim()) chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim() || null;
}

function hasRefusal(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.some((item) =>
    isRecord(item) &&
    Array.isArray(item.content) &&
    item.content.some((content) => isRecord(content) && content.type === 'refusal'),
  );
}

function issuePath(path: (string | number)[]): string {
  if (!path.length) return '$';
  return path.reduce<string>((result, part) =>
    typeof part === 'number' ? `${result}[${part}]` : `${result}.${part}`,
  '$');
}

function issueMessage(issue: z.ZodIssue): string {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return `Expected ${issue.expected}.`;
    case z.ZodIssueCode.invalid_literal:
      return 'Value must match the schema literal.';
    case z.ZodIssueCode.unrecognized_keys:
      return 'Contains unexpected fields.';
    case z.ZodIssueCode.invalid_union:
      return 'Value does not match any allowed shape.';
    case z.ZodIssueCode.invalid_union_discriminator:
      return 'Value has an invalid discriminator.';
    case z.ZodIssueCode.invalid_enum_value:
      return `Must be one of: ${issue.options.join(', ')}.`;
    case z.ZodIssueCode.invalid_arguments:
    case z.ZodIssueCode.invalid_return_type:
      return 'Value has an invalid shape.';
    case z.ZodIssueCode.invalid_date:
      return 'Expected a valid date.';
    case z.ZodIssueCode.invalid_string:
      return 'String does not match the required format.';
    case z.ZodIssueCode.too_small:
      return `Must contain at least ${issue.minimum} ${issue.type === 'array' ? 'items' : 'characters'}.`;
    case z.ZodIssueCode.too_big:
      return `Must contain at most ${issue.maximum} ${issue.type === 'array' ? 'items' : 'characters'}.`;
    case z.ZodIssueCode.not_multiple_of:
      return 'Number is not an allowed multiple.';
    case z.ZodIssueCode.not_finite:
      return 'Expected a finite number.';
    case z.ZodIssueCode.custom:
      return SAFE_STRUCTURED_OUTPUT_MESSAGES.has(issue.message) ? issue.message : 'Failed semantic validation.';
    default:
      return 'Failed schema validation.';
  }
}

export function sanitizeZodIssues(issues: z.ZodIssue[]): SanitizedValidationIssue[] {
  return issues.slice(0, MAX_VALIDATION_ISSUES).map((issue) => ({
    path: issuePath(issue.path).slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
    message: issueMessage(issue).replace(/[\r\n\t]+/g, ' ').slice(0, MAX_VALIDATION_MESSAGE_LENGTH),
  }));
}

function addIssues(
  aggregate: SanitizedValidationIssue[],
  incoming: SanitizedValidationIssue[],
): SanitizedValidationIssue[] {
  const seen = new Set(aggregate.map((issue) => `${issue.path}:${issue.message}`));
  const next = [...aggregate];
  for (const issue of incoming) {
    const key = `${issue.path}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(issue);
    if (next.length >= MAX_VALIDATION_ISSUES) break;
  }
  return next;
}

function correctiveFeedback(issues: SanitizedValidationIssue[]): string {
  const lines = issues.slice(0, MAX_VALIDATION_ISSUES).map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    'The previous response failed validation. Regenerate the entire result from the original inputs.',
    'Return only JSON that matches the response schema. Fix these issues:',
    ...lines,
  ].join('\n');
}

function requestWithFeedback(request: Record<string, unknown>, feedback: string | null) {
  if (!feedback) return request;
  const originalInput = typeof request.input === 'string'
    ? [{ role: 'user', content: [{ type: 'input_text', text: request.input }] }]
    : Array.isArray(request.input) ? request.input : [];
  return {
    ...request,
    input: [
      ...originalInput,
      {
        role: 'user',
        content: [{ type: 'input_text', text: feedback }],
      },
    ],
  };
}

function retryableError(error: unknown) {
  if (!(error instanceof StructuredOutputError)) return false;
  const override = RETRYABILITY_OVERRIDES.get(error);
  if (override !== undefined) return override;
  if (error.code === 'openai_timeout' || error.code === 'openai_request_failed') return true;
  if (RETRYABLE_OUTPUT_CODES.has(error.code)) return true;
  return error.status === 408 || error.status === 409 || error.status === 429 || (error.status ?? 0) >= 500;
}

export function isRetryableOpenAiError(error: unknown) {
  if (error instanceof StructuredOutputError) return retryableError(error);
  if (!(error instanceof Error)) return true;
  if (
    error.message === 'openai_timeout' ||
    error.message === 'openai_request_failed' ||
    RETRYABLE_OUTPUT_CODES.has(error.message)
  ) {
    return true;
  }
  const match = error.message.match(/^openai_error:(\d+):/);
  if (!match) return false;
  const status = Number(match[1]);
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function publicFailure(error: StructuredOutputError): StructuredOutputError {
  if (!RETRYABLE_OUTPUT_CODES.has(error.code) && error.code !== 'openai_refusal') return error;
  return new StructuredOutputError({
    code: error.code,
    message: 'openai_request_failed',
    status: error.status,
    retryable: RETRYABILITY_OVERRIDES.get(error),
    attempts: error.attempts,
    validationIssues: error.validationIssues,
    latencyMs: error.latencyMs,
    cause: error,
  });
}

function retryableResponseFailure(payload: Record<string, unknown>) {
  const incompleteDetails = isRecord(payload.incomplete_details) ? payload.incomplete_details : null;
  if (incompleteDetails) {
    return incompleteDetails.reason === 'max_output_tokens';
  }

  const responseError = isRecord(payload.error) ? payload.error : null;
  return typeof responseError?.code === 'string' && RETRYABLE_RESPONSE_ERROR_CODES.has(responseError.code);
}

export async function requestStructuredOutput<TSchema extends z.ZodTypeAny>(input: {
  apiKey: string;
  stage: string;
  request: Record<string, unknown>;
  definition: StructuredOutputDefinition<TSchema>;
  timeoutMs: number;
  deadlineAt?: number;
  attempts?: number;
  retryDelayMs?: number;
}): Promise<StructuredOutputResult<z.infer<TSchema>>> {
  const startedAt = Date.now();
  const attempts: StructuredOutputAttempt[] = [];
  let attemptNumber = 0;
  let feedback: string | null = null;
  let validationIssues: SanitizedValidationIssue[] = [];

  const makeError = (options: Omit<StructuredOutputErrorOptions, 'attempts' | 'validationIssues' | 'latencyMs'>) =>
    new StructuredOutputError({
      ...options,
      attempts,
      validationIssues,
      latencyMs: Date.now() - startedAt,
    });

  try {
    const value = await withRetry(async () => {
      const remainingMs = input.deadlineAt === undefined
        ? input.timeoutMs
        : Math.min(input.timeoutMs, input.deadlineAt - Date.now());
      if (remainingMs <= 0) {
        throw makeError({ code: 'openai_timeout', retryable: false });
      }
      attemptNumber += 1;
      const attemptStartedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), remainingMs);
      let response: Response;

      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestWithFeedback(input.request, feedback)),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeout);
        const errorName = isRecord(error) && typeof error.name === 'string' ? error.name : '';
        const code = errorName === 'AbortError' ? 'openai_timeout' : 'openai_request_failed';
        attempts.push({
          attempt: attemptNumber,
          rawResponseText: null,
          rawResponseJson: null,
          outputText: null,
          latencyMs: Date.now() - attemptStartedAt,
          errorCode: code,
        });
        throw makeError({ code, cause: error });
      }

      let rawResponseText: string;
      try {
        rawResponseText = await response.text();
      } catch (error) {
        const errorName = isRecord(error) && typeof error.name === 'string' ? error.name : '';
        const code = errorName === 'AbortError' ? 'openai_timeout' : 'openai_request_failed';
        attempts.push({
          attempt: attemptNumber,
          rawResponseText: null,
          rawResponseJson: null,
          outputText: null,
          latencyMs: Date.now() - attemptStartedAt,
          errorCode: code,
        });
        throw makeError({ code, cause: error });
      } finally {
        clearTimeout(timeout);
      }
      let rawResponseJson: unknown = null;
      try {
        rawResponseJson = rawResponseText ? JSON.parse(rawResponseText) : null;
      } catch {
        rawResponseJson = { rawText: rawResponseText };
      }
      const attempt: StructuredOutputAttempt = {
        attempt: attemptNumber,
        rawResponseText,
        rawResponseJson,
        outputText: null,
        latencyMs: Date.now() - attemptStartedAt,
      };
      attempts.push(attempt);

      if (!response.ok) {
        const code = `openai_error_${response.status}`;
        attempt.errorCode = code;
        throw makeError({
          code,
          message: `openai_error:${response.status}:request_failed`,
          status: response.status,
        });
      }

      if (hasRefusal(rawResponseJson)) {
        attempt.errorCode = 'openai_refusal';
        throw makeError({ code: 'openai_refusal' });
      }

      const payload = isRecord(rawResponseJson) ? rawResponseJson : {};
      if (payload.status === 'incomplete' || payload.incomplete_details) {
        const issues = [{ path: '$', message: 'Response was incomplete. Return the complete JSON object.' }];
        validationIssues = addIssues(validationIssues, issues);
        feedback = correctiveFeedback(issues);
        attempt.errorCode = 'openai_incomplete_output';
        throw makeError({
          code: 'openai_incomplete_output',
          retryable: retryableResponseFailure(payload),
        });
      }

      if (payload.status === 'failed') {
        const issues = [{ path: '$', message: 'Response must include the complete JSON object.' }];
        validationIssues = addIssues(validationIssues, issues);
        feedback = correctiveFeedback(issues);
        attempt.errorCode = 'openai_missing_output';
        throw makeError({
          code: 'openai_missing_output',
          retryable: retryableResponseFailure(payload),
        });
      }

      const outputText = extractOutputText(rawResponseJson);
      attempt.outputText = outputText;
      if (!outputText) {
        const issues = [{ path: '$', message: 'Response must include the complete JSON object.' }];
        validationIssues = addIssues(validationIssues, issues);
        feedback = correctiveFeedback(issues);
        attempt.errorCode = 'openai_missing_output';
        throw makeError({ code: 'openai_missing_output' });
      }

      try {
        return input.definition.parse(outputText);
      } catch (error) {
        if (error instanceof z.ZodError) {
          const issues = sanitizeZodIssues(error.issues);
          validationIssues = addIssues(validationIssues, issues);
          feedback = correctiveFeedback(issues);
          attempt.errorCode = 'openai_validation_failed';
          throw makeError({ code: 'openai_validation_failed' });
        }
        const issues = [{ path: '$', message: 'Response must be valid JSON.' }];
        validationIssues = addIssues(validationIssues, issues);
        feedback = correctiveFeedback(issues);
        attempt.errorCode = 'openai_invalid_json';
        throw makeError({ code: 'openai_invalid_json' });
      }
    }, {
      attempts: input.attempts ?? DEFAULT_ATTEMPTS,
      delayMs: input.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      deadlineAt: input.deadlineAt,
      shouldRetry: retryableError,
      onRetry: (error, attempt) => {
        const structured = error as StructuredOutputError;
        console.warn('[openai] structured_output_retry', {
          stage: input.stage,
          attempt,
          nextAttempt: attempt + 1,
          code: structured.code,
          validationIssues: structured.validationIssues,
        });
      },
    });

    return {
      value,
      attempts,
      attemptCount: attemptNumber,
      validationIssues,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const structured = error instanceof StructuredOutputError
      ? error
      : makeError({ code: 'openai_request_failed', cause: error });
    console.warn('[openai] structured_output_failed', {
      stage: input.stage,
      attemptCount: structured.attempts.length,
      code: structured.code,
      validationIssues: structured.validationIssues,
    });
    throw publicFailure(structured);
  }
}

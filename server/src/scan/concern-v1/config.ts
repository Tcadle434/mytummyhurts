import { reasoningFields, verbosityField } from '../engine/openaiConfig';

function positiveNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedPositiveInteger(name: string, fallback: number, maximum: number) {
  return Math.min(positiveInteger(name, fallback), maximum);
}

export const CONCERN_MECHANISM_MODEL =
  process.env.OPENAI_CONCERN_MECHANISM_MODEL ?? 'gpt-5.4-mini';
export const CONCERN_ADJUDICATION_MODEL =
  process.env.OPENAI_CONCERN_ADJUDICATION_MODEL ?? 'gpt-5.4-mini';
export const CONCERN_VERIFICATION_MODEL =
  process.env.OPENAI_CONCERN_VERIFICATION_MODEL ?? 'gpt-5.4-mini';

export const CONCERN_TIMEOUT_MS = positiveNumber('OPENAI_CONCERN_TIMEOUT_MS', 45_000);
export const CONCERN_MAX_OUTPUT_TOKENS = positiveInteger(
  'OPENAI_CONCERN_MAX_OUTPUT_TOKENS',
  6_000,
);
export const CONCERN_BATCH_SIZE = boundedPositiveInteger(
  'OPENAI_CONCERN_BATCH_SIZE',
  12,
  20,
);
export const CONCERN_MAX_CONCURRENT_RUNS = boundedPositiveInteger(
  'CONCERN_V1_MAX_CONCURRENT_RUNS',
  2,
  10,
);
export const CONCERN_MAX_QUEUED_RUNS = boundedPositiveInteger(
  'CONCERN_V1_MAX_QUEUED_RUNS',
  20,
  200,
);
export const CONCERN_QUEUE_TIMEOUT_MS = positiveNumber(
  'CONCERN_V1_QUEUE_TIMEOUT_MS',
  30_000,
);

export function concernShadowEnabled() {
  const value = (process.env.CONCERN_V1_SHADOW_ENABLED ?? 'on').trim().toLowerCase();
  return Boolean(process.env.OPENAI_API_KEY) && !['0', 'false', 'off'].includes(value);
}

export function concernReasoningFields(model: string, effort: 'low' | 'medium') {
  return reasoningFields(model, effort);
}

export function concernVerbosityField(model: string) {
  return verbosityField(model);
}

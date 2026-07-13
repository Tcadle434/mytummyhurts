// Shared request and audit types for the OpenAI scan-engine calls.

import { DietPreference } from './domain';

export type OpenAiAuditLog = {
  stage: string;
  provider: 'openai';
  model: string;
  promptVersion: string;
  schemaVersion: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  requestMetadata: Record<string, unknown>;
  inputRefs: unknown[];
  rawResponseText: string | null;
  rawResponseJson: unknown;
  parsedResponseJson: unknown;
  normalizedResponseJson?: unknown;
  status: 'completed' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs: number;
  openaiResponseId?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsdMicros?: number | null;
  pricingSnapshot?: unknown;
  billable?: boolean;
};

export type ExtractionWithAudit<T> = {
  result: T;
  audits: OpenAiAuditLog[];
};

export type ExtractionContext = {
  knownConditions: string[];
  knownIngredients: string[];
  dietPreferences?: DietPreference[];
  /**
   * Set false when the active scoring engine will discard extraction
   * conditionSeverities (mechanism-only scoring); the food prompts then ask
   * for an empty array instead of paying for bands nobody reads. Defaults to
   * true, and FOOD_LLM_BANDS=off force-disables it (mirrors MENU_LLM_BANDS).
   */
  requestConditionBands?: boolean;
};

export type ResponseAuditDescriptor = {
  stage: string;
  model: string;
  promptVersion?: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  schemaVersion: string;
  requestMetadata?: Record<string, unknown>;
  inputRefs?: unknown[];
};

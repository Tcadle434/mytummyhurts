// Env-derived configuration for the OpenAI scan-engine calls: API key, stage
// models, prompt/schema versions, timeouts, token caps, and feature levers.

function positiveNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
// Demo fallbacks (fabricated dish-library extractions) are opt-in only: without
// this flag a missing OPENAI_API_KEY fails at startup (see core/env.validation)
// and these entry points throw instead of inventing meals.
export const DEMO_MODE = process.env.DEMO_MODE === 'true';
// Exported model/version constants are the single source of truth for audit
// metadata and version bookkeeping (trace.service ensureVersions).
export const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
export const IMAGE_EXTRACTION_MODEL = process.env.OPENAI_IMAGE_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
export const MENU_EXTRACTION_MODEL = process.env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini';
// Cheap dedicated router for the food-vs-menu decision; low detail + a small
// output cap keep it a fraction of an extraction call.
export const CLASSIFICATION_MODEL = process.env.OPENAI_CLASSIFICATION_MODEL ?? 'gpt-5-nano';
// Adjudication is a reasoning re-read of already-extracted facts, not vision:
// gpt-5-mini at low effort replaces gpt-4.1-mini (Phase 2 item 4).
export const RISK_ADJUDICATION_MODEL = process.env.OPENAI_RISK_ADJUDICATION_MODEL ?? 'gpt-5-mini';
export const PROMPT_VERSION = process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'mytummyhurts_extract_v4';
// Audit schema versions: v3 food / v4 menu mark the Phase 2 schema changes
// (field-anchor descriptions, dietFit maxItems 10, menu bands without rationale).
export const EXTRACTION_SCHEMA_VERSION = 'meal_extraction_v3';
export const MENU_EXTRACTION_SCHEMA_VERSION = 'menu_extraction_v4';
// Determinism lever. GPT-5-family models often reject a non-default temperature,
// so this is OPT-IN: only sent when OPENAI_EXTRACTION_TEMPERATURE is set to a
// number. Note there is NO extraction cache: repeat submissions are deduped by
// requestId idempotency in the reservation layer, but a genuinely new scan of
// the same food re-runs extraction and may vary. Set to "0" once a model is
// confirmed to accept it.
const EXTRACTION_TEMPERATURE = (() => {
  const raw = process.env.OPENAI_EXTRACTION_TEMPERATURE;
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
})();

// Spread into food-extraction request bodies; empty unless the env var is set.
export function extractionSamplingFields(): Record<string, number> {
  return EXTRACTION_TEMPERATURE === undefined ? {} : { temperature: EXTRACTION_TEMPERATURE };
}

// `reasoning.effort` and `text.verbosity` are gpt-5-family Responses params;
// gpt-4.1 and older reject the whole request with invalid_request_error. All
// stage models are env-overridable, so gate the params on the RESOLVED model —
// a stale model pin must degrade to defaults, never crash the stage. (Found
// live: OPENAI_RISK_ADJUDICATION_MODEL pinned to gpt-4.1-mini made every
// adjudication call fail instantly while the pipeline silently fell back.)
function supportsReasoningParams(model: string): boolean {
  return model.startsWith('gpt-5');
}

export function reasoningFields(model: string, effort: 'minimal' | 'low' | 'medium'): Record<string, unknown> {
  return supportsReasoningParams(model) ? { reasoning: { effort } } : {};
}

export function verbosityField(model: string): Record<string, string> {
  return supportsReasoningParams(model) ? { verbosity: 'low' } : {};
}
export const IMAGE_DETAIL = (process.env.OPENAI_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
export const MENU_IMAGE_DETAIL = (process.env.OPENAI_MENU_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
export const OPENAI_TIMEOUT_MS = positiveNumberEnv('OPENAI_TIMEOUT_MS', 30_000);
export const OPENAI_MENU_TIMEOUT_MS = positiveNumberEnv('OPENAI_MENU_TIMEOUT_MS', 115_000);
export const OPENAI_MENU_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_MENU_MAX_OUTPUT_TOKENS', 12_000);
export const OPENAI_TEXT_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_TEXT_MAX_OUTPUT_TOKENS', 6_000);
export const OPENAI_IMAGE_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_IMAGE_MAX_OUTPUT_TOKENS', 6_000);
export const OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS', 300);
export const OPENAI_RISK_ADJUDICATION_TIMEOUT_MS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_TIMEOUT_MS', 30_000);
export const OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS', 3_000);
// When off, menu extraction skips per-condition LLM bands and the engine falls
// back to mechanism-only scoring for menus (revert lever for cost/latency).
export const MENU_LLM_BANDS = (process.env.MENU_LLM_BANDS ?? 'on') !== 'off';
// Same lever for food scans. Effective only when the caller will actually
// consume bands (see ExtractionContext.requestConditionBands); the mechanism
// scoring path discards extraction bands, so it turns the request off.
export const FOOD_LLM_BANDS = (process.env.FOOD_LLM_BANDS ?? 'on') !== 'off';

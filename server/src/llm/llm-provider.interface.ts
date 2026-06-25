import type * as engine from '../scan/engine/openai';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Swappable provider seam. Only OpenAI is wired today; an Anthropic implementation
 * can be added later behind the same token. Extraction method types are taken
 * directly from the ported engine functions so prompts/schemas/audits stay
 * byte-compatible with the original pipeline.
 */
export interface LlmProvider {
  readonly name: string;
  extractText: typeof engine.extractMealFromTextWithAudit;
  extractImages: typeof engine.extractMealFromImagesWithAudit;
  classifyImages: typeof engine.classifyScanImagesWithAudit;
  extractMenu: typeof engine.extractMenuFromImagesWithAudit;
  adjudicateScanRisk: typeof engine.adjudicateScanRiskWithAudit;
  /** Embeddings for RAG retrieval (Phase 7). */
  embed(texts: string[]): Promise<number[][]>;
}

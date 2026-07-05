import { Injectable } from '@nestjs/common';

import {
  classifyScanImagesWithAudit,
  adjudicateScanRiskWithAudit,
  extractMealFromImagesWithAudit,
  extractMealFromTextWithAudit,
  extractMenuFromImagesWithAudit,
} from '../scan/engine/openai';
import { TraceService } from '../trace/trace.service';
import { LlmProvider } from './llm-provider.interface';

type EmbeddingsResponse = {
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';

  constructor(private readonly trace: TraceService) {}

  // Extraction delegates to the ported engine functions verbatim (same request
  // bodies, schemas, audit construction). With no OPENAI_API_KEY they throw,
  // unless DEMO_MODE=true opts in to the deterministic fallback extraction.
  extractText = extractMealFromTextWithAudit;
  extractImages = extractMealFromImagesWithAudit;
  classifyImages = classifyScanImagesWithAudit;
  extractMenu = extractMenuFromImagesWithAudit;
  adjudicateScanRisk = adjudicateScanRiskWithAudit;

  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('openai_api_key_missing');
    const model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) throw new Error(`embeddings_failed_${res.status}`);
    const json = (await res.json()) as EmbeddingsResponse;
    // Ledger the spend (best-effort, off the hot path): embeddings were the one
    // OpenAI call missing from ai_cost_events.
    void this.trace.recordEmbeddingCostEvent({
      model,
      inputTokens: json.usage?.prompt_tokens ?? null,
      totalTokens: json.usage?.total_tokens ?? null,
    });
    return json.data.map((d) => d.embedding);
  }
}

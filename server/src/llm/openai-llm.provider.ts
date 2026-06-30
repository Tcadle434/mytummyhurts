import { Injectable } from '@nestjs/common';

import {
  classifyScanImagesWithAudit,
  adjudicateScanRiskWithAudit,
  extractMealFromImagesWithAudit,
  extractMealFromTextWithAudit,
  extractMenuFromImagesWithAudit,
} from '../scan/engine/openai';
import { LlmProvider } from './llm-provider.interface';

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = 'openai';

  // Extraction delegates to the ported engine functions verbatim (same request
  // bodies, schemas, audit construction). With no OPENAI_API_KEY they return the
  // deterministic fallback extraction.
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
    const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((d) => d.embedding);
  }
}

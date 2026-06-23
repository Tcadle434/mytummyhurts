import { Inject, Injectable } from '@nestjs/common';

import { LLM_PROVIDER, LlmProvider } from '../llm/llm-provider.interface';

export const EMBEDDER = Symbol('EMBEDDER');

export interface Embedder {
  readonly dim: number;
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

@Injectable()
export class OpenAiEmbedder implements Embedder {
  readonly dim = 1536;
  readonly model = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  embed(texts: string[]): Promise<number[][]> {
    return this.llm.embed(texts);
  }
}

/** pgvector literal for a float array, e.g. [0.1,0.2] -> '[0.1,0.2]'. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

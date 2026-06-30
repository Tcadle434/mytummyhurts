import { Injectable } from '@nestjs/common';

export const RERANKER = Symbol('RERANKER');

export interface Candidate {
  chunkId: string;
  documentId: string;
  content: string;
  source: string;
  title: string;
  url: string | null;
  headingPath: string[];
  conditionTags: string[];
  ingredientTags: string[];
  direction: 'raises' | 'lowers' | 'neutral' | null;
  vectorScore: number;
  keywordScore: number;
  hybridScore: number;
}

export interface RankedCandidate extends Candidate {
  rerankScore: number;
}

export interface Reranker {
  readonly name: string;
  rerank(query: string, candidates: Candidate[]): Promise<RankedCandidate[]>;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Deterministic fallback reranker — always available, so a slow/failed external
 * reranker never fails or stalls the scan. Blends hybrid + keyword signal.
 */
@Injectable()
export class FallbackReranker implements Reranker {
  readonly name = 'fallback_scorer';

  async rerank(_query: string, candidates: Candidate[]): Promise<RankedCandidate[]> {
    return candidates
      .map((c) => ({
        ...c,
        rerankScore: clamp01(0.7 * c.hybridScore + 0.3 * c.keywordScore),
      }))
      .sort((a, b) => b.rerankScore - a.rerankScore);
  }
}

import { describe, expect, it } from 'vitest';

import {
  evaluateRetrievalCase,
  summarizeRetrievalResults,
} from '../scripts/eval/retrieval-eval-lib.mjs';

const chunk = (title: string, direction = 'raises') => ({
  chunkId: title,
  title,
  content: `${title} supporting evidence`,
  direction,
  rerankScore: 0.8,
});

describe('retrieval eval metrics', () => {
  it('computes precision, recall, reciprocal rank, and nDCG from document labels', () => {
    const result = evaluateRetrievalCase(
      {
        id: 'case',
        expectedDocuments: ['Garlic Evidence', 'IBS Evidence'],
        minPrecisionAtK: 0.5,
        minRecallAtK: 1,
        minReciprocalRank: 0.5,
        minNdcgAtK: 0.5,
      },
      [chunk('Unrelated'), chunk('Garlic Evidence'), chunk('IBS Evidence'), chunk('Another')],
      4,
    );

    expect(result.passed).toBe(true);
    expect(result.metrics).toMatchObject({
      precisionAtK: 0.5,
      recallAtK: 1,
      reciprocalRank: 0.5,
    });
    expect(result.metrics.ndcgAtK).toBeGreaterThan(0.5);
  });

  it('fails when a wrong-condition document is returned', () => {
    const result = evaluateRetrievalCase(
      {
        id: 'case',
        expectedDocuments: ['IBS Evidence'],
        forbiddenDocuments: ['Celiac Evidence'],
      },
      [chunk('IBS Evidence'), chunk('Celiac Evidence')],
      2,
    );
    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/forbidden document/);
  });

  it('requires labeled evidence directions when configured', () => {
    const result = evaluateRetrievalCase(
      { id: 'safe', expectedDocuments: ['Gentle Foods'], requiredDirections: ['lowers'] },
      [chunk('Gentle Foods', 'raises')],
      1,
    );
    expect(result.passed).toBe(false);
    expect(result.errors.join(' ')).toMatch(/missing required direction/);
  });

  it('summarizes aggregate ranking quality', () => {
    const validation = evaluateRetrievalCase(
      { id: 'one', expectedDocuments: ['Relevant'] },
      [chunk('Relevant')],
      1,
    );
    expect(summarizeRetrievalResults([{ validation }, { validation }])).toMatchObject({
      total: 2,
      passed: 2,
      meanPrecisionAtK: 1,
      meanRecallAtK: 1,
      meanReciprocalRank: 1,
      meanNdcgAtK: 1,
    });
  });
});

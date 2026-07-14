import { afterEach, describe, expect, it, vi } from 'vitest';

const originalBatchSize = process.env.OPENAI_CONCERN_BATCH_SIZE;
const originalMaxConcurrentRuns = process.env.CONCERN_V1_MAX_CONCURRENT_RUNS;

afterEach(() => {
  if (originalBatchSize === undefined) delete process.env.OPENAI_CONCERN_BATCH_SIZE;
  else process.env.OPENAI_CONCERN_BATCH_SIZE = originalBatchSize;
  if (originalMaxConcurrentRuns === undefined) delete process.env.CONCERN_V1_MAX_CONCURRENT_RUNS;
  else process.env.CONCERN_V1_MAX_CONCURRENT_RUNS = originalMaxConcurrentRuns;
  vi.resetModules();
});

describe('concern v1 configuration', () => {
  it('falls back from fractional values for integer concurrency and batching limits', async () => {
    process.env.OPENAI_CONCERN_BATCH_SIZE = '0.5';
    process.env.CONCERN_V1_MAX_CONCURRENT_RUNS = '0.5';
    vi.resetModules();

    const config = await import('../src/scan/concern-v1/config');

    expect(config.CONCERN_BATCH_SIZE).toBe(12);
    expect(config.CONCERN_MAX_CONCURRENT_RUNS).toBe(2);
  });
});

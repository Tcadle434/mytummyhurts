import { afterEach, describe, expect, it, vi } from 'vitest';

const originalBatchSize = process.env.OPENAI_CONCERN_BATCH_SIZE;
const originalMaxConcurrentRuns = process.env.CONCERN_V1_MAX_CONCURRENT_RUNS;
const originalShadowEnabled = process.env.CONCERN_V1_SHADOW_ENABLED;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalBatchSize === undefined) delete process.env.OPENAI_CONCERN_BATCH_SIZE;
  else process.env.OPENAI_CONCERN_BATCH_SIZE = originalBatchSize;
  if (originalMaxConcurrentRuns === undefined) delete process.env.CONCERN_V1_MAX_CONCURRENT_RUNS;
  else process.env.CONCERN_V1_MAX_CONCURRENT_RUNS = originalMaxConcurrentRuns;
  if (originalShadowEnabled === undefined) delete process.env.CONCERN_V1_SHADOW_ENABLED;
  else process.env.CONCERN_V1_SHADOW_ENABLED = originalShadowEnabled;
  if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
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

  it('keeps the experimental shadow off unless it is explicitly enabled', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.CONCERN_V1_SHADOW_ENABLED;
    vi.resetModules();

    let config = await import('../src/scan/concern-v1/config');
    expect(config.concernShadowEnabled()).toBe(false);

    process.env.CONCERN_V1_SHADOW_ENABLED = 'on';
    vi.resetModules();
    config = await import('../src/scan/concern-v1/config');
    expect(config.concernShadowEnabled()).toBe(true);
  });
});

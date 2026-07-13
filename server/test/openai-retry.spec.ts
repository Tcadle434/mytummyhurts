import { describe, expect, it } from 'vitest';

import { isTransientOpenAiError } from '../src/scan/engine/openai';

describe('isTransientOpenAiError', () => {
  it('retries timeouts, truncated output, and network-layer fetch failures', () => {
    expect(isTransientOpenAiError(new Error('openai_timeout'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_invalid_json'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_missing_output'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_incomplete_output'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_validation_failed'))).toBe(true);
    // "fetch failed" (ECONNRESET / socket hang up) is thrown before any HTTP
    // status exists — it must be retryable or golden-eval runs flake ~5%.
    expect(isTransientOpenAiError(new Error('openai_request_failed'))).toBe(true);
  });

  it('retries retryable HTTP statuses and refuses hard 4xx failures', () => {
    expect(isTransientOpenAiError(new Error('openai_error:429:rate limited'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_error:503:overloaded'))).toBe(true);
    expect(isTransientOpenAiError(new Error('openai_error:400:bad request'))).toBe(false);
    expect(isTransientOpenAiError(new Error('openai_error:401:unauthorized'))).toBe(false);
    expect(isTransientOpenAiError(new Error('openai_refusal'))).toBe(false);
  });
});

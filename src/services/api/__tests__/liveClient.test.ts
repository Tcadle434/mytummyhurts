import { describe, expect, it } from 'vitest';

import { ApiError, normalizeRetryableTransportError } from '../errors';

describe('ApiError', () => {
  it('preserves status, code, and details for function failures', () => {
    const error = new ApiError('Already processing', {
      status: 409,
      code: 'scan_in_progress',
      details: {
        requestId: 'scan-request-abc',
      },
    });

    expect(error.message).toBe('Already processing');
    expect(error.status).toBe(409);
    expect(error.code).toBe('scan_in_progress');
    expect(error.details).toEqual({ requestId: 'scan-request-abc' });
  });
});

describe('normalizeRetryableTransportError', () => {
  it('turns Supabase blob resolution failures into retryable API errors', () => {
    const error = new Error('AuthRetryableFetchError: Unable to resolve data for blob: ABC-123');
    error.name = 'AuthRetryableFetchError';

    const normalized = normalizeRetryableTransportError(error, 'daily-report-upsert');

    expect(normalized).toBeInstanceOf(ApiError);
    expect(normalized?.code).toBe('network_retryable');
    expect(normalized?.message).toBe('The request could not reach MyTummyHurts. Please try again.');
    expect(normalized?.details).toMatchObject({
      functionName: 'daily-report-upsert',
      cause: 'AuthRetryableFetchError: Unable to resolve data for blob: ABC-123',
    });
  });

  it('leaves unrelated errors unchanged', () => {
    expect(normalizeRetryableTransportError(new Error('nope'))).toBeNull();
  });
});

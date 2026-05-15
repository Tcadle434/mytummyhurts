export class ApiError extends Error {
  status?: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, options: { status?: number; code?: string; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code ?? 'request_failed';
    this.details = options.details;
  }
}

export function normalizeRetryableTransportError(error: unknown, functionName = 'backend') {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message;
  const isRetryableFetchError =
    error.name === 'AuthRetryableFetchError' ||
    /AuthRetryableFetchError/i.test(message) ||
    /Unable to resolve data for blob/i.test(message);

  if (!isRetryableFetchError) {
    return null;
  }

  return new ApiError('The request could not reach MyTummyHurts. Please try again.', {
    code: 'network_retryable',
    details: {
      functionName,
      cause: message,
    },
  });
}

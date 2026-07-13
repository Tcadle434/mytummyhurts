export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    delayMs?: number;
    deadlineAt?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {},
) {
  const attempts = Math.max(1, options.attempts ?? 2);
  const delayMs = Math.max(0, options.delayMs ?? 300);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const shouldRetry = attempt < attempts && (options.shouldRetry?.(error) ?? true);
      if (!shouldRetry) {
        throw error;
      }

      const retryDelayMs = delayMs * attempt;
      if (options.deadlineAt !== undefined && Date.now() + retryDelayMs >= options.deadlineAt) {
        throw error;
      }
      options.onRetry?.(error, attempt);
      await sleep(retryDelayMs);
    }
  }

  throw new Error('retry_exhausted');
}

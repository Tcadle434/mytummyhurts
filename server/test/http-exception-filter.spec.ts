import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpExceptionFilter } from '../src/core/http-exception.filter';

function mockHost() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('HttpExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps OpenAI timeouts to a retryable request_timeout envelope', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, res } = mockHost();

    new HttpExceptionFilter().catch(new Error('openai_timeout'), host);

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'request_timeout',
        message: 'The AI scan timed out. Please try again.',
      },
    });
  });
});

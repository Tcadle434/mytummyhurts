import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Maps every error to the `{ error: { code, message, details? } }` envelope the
 * Expo client already expects (see src/services/api/errors.ts). Preserves the
 * edge functions' contract so the frontend's ApiError mapping is unchanged.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let code = 'internal_error';
    let message = 'Something went wrong.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        code = body;
        message = body;
      } else {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b.message)) {
          code = 'validation_error';
          message = (b.message as string[]).join('; ');
        } else {
          code = (b.code as string) ?? (b.error as string) ?? (b.message as string) ?? 'error';
          message = (b.message as string) ?? code;
        }
        details = b.details;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    if (status >= 500 && process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
    });
  }
}

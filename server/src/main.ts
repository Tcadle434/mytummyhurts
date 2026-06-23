import './bootstrap-env';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './core/http-exception.filter';

async function bootstrap(): Promise<void> {
  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? 'production' });
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  // Global request validation — every endpoint DTO is whitelisted, and unknown
  // properties are rejected (matches the strict edge-function body parsing).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Map all errors to the { error: { code, message } } envelope the app expects.
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`MyTummyHurts API listening on :${port}`);
}

void bootstrap();

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { validateEnv } from './core/env.validation';
import { OpsModule } from './ops/ops.module';
import { PushModule } from './push/push.module';

import { AccountModule } from './account/account.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CommonModule } from './common/common.module';
import { DailyReportModule } from './daily-report/daily-report.module';
import { InsightsModule } from './insights/insights.module';
import { ProfileModule } from './profile/profile.module';
import { DatabaseModule } from './database/database.module';
import { EvalModule } from './eval/eval.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { LearningModule } from './learning/learning.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LlmModule } from './llm/llm.module';
import { RagModule } from './rag/rag.module';
import { ScanModule } from './scan/scan.module';
import { StorageModule } from './storage/storage.module';
import { TraceModule } from './trace/trace.module';

@Module({
  imports: [
    // Fail fast on misconfiguration: a server without an OpenAI key must crash
    // at boot (or run with an explicit DEMO_MODE=true opt-in), never fabricate.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Structured logging with PII/secret redaction — never log tokens, passwords,
    // base64 image data, prompts, or auth identity tokens.
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: [
          'req.headers.authorization',
          'req.headers["x-internal-secret"]',
          'req.body.password',
          'req.body.refreshToken',
          'req.body.identityToken',
          'req.body.idToken',
          'req.body.imageDataUrls',
          'req.body.imageDataUrl',
          'req.body.text',
        ],
        autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
      },
    }),
    // Per-user/per-endpoint rate limiting. In-memory store for single-instance
    // v1; swap to the Redis storage adapter when running multiple API instances.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    StorageModule,
    TraceModule,
    LlmModule,
    RagModule,
    AuthModule,
    ScanModule,
    LearningModule,
    EvalModule,
    AdminModule,
    DailyReportModule,
    NotificationsModule,
    AccountModule,
    BillingModule,
    InsightsModule,
    ProfileModule,
    HomeModule,
    PushModule,
    OpsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

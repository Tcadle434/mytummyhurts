import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { Public } from '../auth/decorators/public.decorator';
import { PostgresHealthIndicator } from './postgres.health';
import { StorageHealthIndicator } from './storage.health';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgres: PostgresHealthIndicator,
    private readonly storage: StorageHealthIndicator,
  ) {}

  // Liveness: process is up. Used by the container/orchestrator restart probe.
  @Public()
  @Get('healthz')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  // Readiness: dependency reachability. Postgres now; Redis/MinIO added later.
  @Public()
  @Get('readyz')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.postgres.ping(),
      () => this.storage.ping(),
    ]);
  }
}

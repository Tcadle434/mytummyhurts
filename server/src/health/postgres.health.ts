import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  constructor(private readonly db: DatabaseService) {
    super();
  }

  async ping(key = 'postgres'): Promise<HealthIndicatorResult> {
    try {
      await this.db.serviceClient`select 1`;
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError(
        'postgres unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}

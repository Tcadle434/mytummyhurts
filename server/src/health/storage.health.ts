import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';

import { StorageService } from '../storage/storage.service';

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly storage: StorageService) {
    super();
  }

  async ping(key = 'storage'): Promise<HealthIndicatorResult> {
    try {
      await this.storage.ping();
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError(
        'storage unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    }
  }
}

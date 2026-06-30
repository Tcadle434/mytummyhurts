import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

export class OperationLockBusyError extends Error {
  constructor() {
    super('operation_lock_busy');
    this.name = 'OperationLockBusyError';
  }
}

/** Wraps acquire/release_user_operation_lock (SECURITY DEFINER RPCs). */
@Injectable()
export class OperationLockService {
  constructor(private readonly db: DatabaseService) {}

  async acquire(
    userId: string,
    operation: string,
    ownerId: string,
    ttlSeconds = 120,
  ): Promise<boolean> {
    const [row] = await this.db.service(
      (sql) =>
        sql`select acquire_user_operation_lock(${userId}, ${operation}, ${ownerId}, ${ttlSeconds}) as ok`,
    );
    return row?.ok === true;
  }

  async release(userId: string, operation: string, ownerId: string): Promise<boolean> {
    const [row] = await this.db.service(
      (sql) => sql`select release_user_operation_lock(${userId}, ${operation}, ${ownerId}) as ok`,
    );
    return row?.ok === true;
  }

  /** Run `fn` while holding the lock; throws OperationLockBusyError if held. */
  async withLock<T>(
    userId: string,
    operation: string,
    ownerId: string,
    fn: () => Promise<T>,
    ttlSeconds = 120,
  ): Promise<T> {
    if (!(await this.acquire(userId, operation, ownerId, ttlSeconds))) {
      throw new OperationLockBusyError();
    }
    try {
      return await fn();
    } finally {
      await this.release(userId, operation, ownerId);
    }
  }
}

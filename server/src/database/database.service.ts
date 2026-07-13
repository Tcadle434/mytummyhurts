import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Sql, TransactionSql } from 'postgres';

import { PG_SCOPED, PG_SERVICE } from './database.constants';
import { assertUuid } from './uuid';

/**
 * The single entry point for database access.
 *
 * - `scoped(userId, fn)` runs `fn` inside a transaction that first sets
 *   `app.current_user_id`, which the shim's `auth.uid()` reads — so every RLS
 *   policy enforces user isolation even if a query forgets its WHERE clause.
 *   This is the ONLY way user-owned data should be read or written.
 * - `service(fn)` runs against the privileged role for legitimate cross-user
 *   work (background jobs, maintenance). It bypasses RLS, so callers are
 *   responsible for their own scoping.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(PG_SCOPED) private readonly scopedSql: Sql,
    @Inject(PG_SERVICE) private readonly serviceSql: Sql,
  ) {}

  scoped<T>(userId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    const uid = assertUuid(userId);
    return this.scopedSql.begin(async (tx) => {
      await tx.unsafe(`set local app.current_user_id = '${uid}'`);
      return fn(tx as unknown as TransactionSql);
    }) as Promise<T>;
  }

  service<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    return fn(this.serviceSql);
  }

  serviceTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    return this.serviceSql.begin(
      (transaction) => fn(transaction as unknown as Sql),
    ) as Promise<T>;
  }

  get serviceClient(): Sql {
    return this.serviceSql;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.scopedSql.end(), this.serviceSql.end()]);
  }
}

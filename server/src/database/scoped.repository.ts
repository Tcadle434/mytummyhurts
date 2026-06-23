import type { TransactionSql } from 'postgres';

import { DatabaseService } from './database.service';

/**
 * Base class for user-scoped repositories (User, Profile, Scan, ...). Every
 * data method routes through `runScoped`, which guarantees both a userId and the
 * `app.current_user_id` GUC (RLS) for the transaction. Per-domain repositories
 * are filled in as endpoints are built (Phase 6), porting the row-mapping logic
 * from supabase/functions/_shared/db.ts.
 */
export abstract class ScopedRepository {
  constructor(protected readonly db: DatabaseService) {}

  protected runScoped<T>(
    userId: string,
    fn: (tx: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return this.db.scoped(userId, fn);
  }
}

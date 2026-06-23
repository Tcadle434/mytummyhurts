import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DatabaseService } from '../database/database.service';

/**
 * Scheduled maintenance. Prunes health-adjacent trace payloads on a retention
 * schedule (configurable): node-trace input/output snapshots after 30 days,
 * retrieval query text after 90 days. The lightweight trace + cost rows are kept
 * for analytics. Disabled with MAINTENANCE_ENABLED=false.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger('Maintenance');

  constructor(private readonly db: DatabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneTraces(): Promise<void> {
    if (process.env.MAINTENANCE_ENABLED === 'false') return;
    const traceDays = Number(process.env.TRACE_RETENTION_DAYS ?? 30);
    const retrievalDays = Number(process.env.RETRIEVAL_RETENTION_DAYS ?? 90);
    try {
      await this.db.service(async (sql) => {
        const pruned = await sql`
          update public.ai_node_traces set input_snapshot = null, output_snapshot = null
          where created_at < now() - (${traceDays} || ' days')::interval
            and (input_snapshot is not null or output_snapshot is not null)`;
        await sql`
          update public.rag_retrieval_runs set query_text = '[pruned]'
          where created_at < now() - (${retrievalDays} || ' days')::interval
            and query_text <> '[pruned]'`;
        if (pruned.count) this.logger.log(`pruned ${pruned.count} node-trace snapshots`);
      });
    } catch (err) {
      this.logger.error(`prune failed: ${(err as Error).message}`);
    }
  }
}

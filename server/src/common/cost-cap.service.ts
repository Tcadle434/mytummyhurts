import { ForbiddenException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

/**
 * Per-user monthly AI cost ceiling. Aggregates ai_cost_events (+ the legacy
 * scan_ai_audit_logs) for the calendar month and blocks new scans once the cap
 * is exceeded. Complements the daily scan-count caps in the reservation RPC.
 * Set MONTHLY_COST_CAP_USD_MICROS=0 to disable.
 */
@Injectable()
export class CostCapService {
  constructor(private readonly db: DatabaseService) {}

  private capMicros(): number {
    return Number(process.env.MONTHLY_COST_CAP_USD_MICROS ?? 0);
  }

  async monthToDateMicros(userId: string): Promise<number> {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select coalesce((
          select sum(estimated_cost_usd_micros) from public.ai_cost_events
          where user_id = ${userId} and created_at >= date_trunc('month', now())
        ), 0) + coalesce((
          select sum(estimated_cost_usd_micros) from public.scan_ai_audit_logs
          where user_id = ${userId} and created_at >= date_trunc('month', now()) and billable
        ), 0) as total`;
      return Number(row?.total ?? 0);
    });
  }

  async assertWithinCap(userId: string): Promise<void> {
    const cap = this.capMicros();
    if (cap <= 0) return; // disabled
    const spent = await this.monthToDateMicros(userId);
    if (spent >= cap) {
      throw new ForbiddenException('monthly_cost_cap_reached');
    }
  }
}

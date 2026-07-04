import { Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';

import { DatabaseService } from '../database/database.service';
import {
  VALIDITY_WINDOWS_DAYS,
  computeValidityStats,
  type ValidityReport,
  type ValidityScan,
  type ValidityWindowStats,
} from './validity';

const SWEEP_USER_CAP = 5000;

/**
 * Loads a user's consumed scans + daily check-ins, runs the pure validity
 * computation (./validity.ts) and upserts one scan_validity_stats row per
 * trailing window. Triggered by 'validity_recompute' learning jobs (enqueued
 * on daily-report submit) and by the nightly all-users admin sweep.
 */
@Injectable()
export class ValidityRecomputeService {
  private readonly logger = new Logger('ValidityRecompute');

  constructor(private readonly db: DatabaseService) {}

  async recomputeForUser(userId: string): Promise<ValidityWindowStats[]> {
    const referenceLocalDate = new Date().toISOString().slice(0, 10);
    const horizonDays = Math.max(...VALIDITY_WINDOWS_DAYS);

    const stats = await this.db.service(async (sql) => {
      const { scans, reports } = await loadValidityRows(sql, userId, horizonDays);
      const computed = computeValidityStats({ scans, reports, referenceLocalDate });
      for (const windowStats of computed) {
        await upsertWindowStats(sql, userId, windowStats);
      }
      return computed;
    });

    // The admin-visible log line: one glance says how reality is scoring us.
    for (const windowStats of stats) {
      this.logger.log(
        `validity user=${userId} window=${windowStats.windowDays}d pairs=${windowStats.nPairs} ` +
          `highHit=${formatRate(windowStats.highHitRate)} safeHit=${formatRate(windowStats.safeHitRate)} ` +
          `calibration=${formatRate(windowStats.calibrationScore)}`,
      );
    }
    return stats;
  }

  /**
   * Nightly all-users pass (admin endpoint, VPS crontab — see
   * docs/predictive-validity.md). Per-user failures are isolated and logged;
   * the sweep always finishes.
   */
  async sweep(): Promise<{ usersProcessed: number; usersFailed: number }> {
    const horizonDays = Math.max(...VALIDITY_WINDOWS_DAYS);
    const users = await this.db.service(
      (sql) => sql`
        select distinct user_id
        from public.scans
        where consumption_status = 'consumed'
          and analysis_status = 'completed'
          and overall_risk_score is not null
          and local_date >= current_date - ${horizonDays}::int
        limit ${SWEEP_USER_CAP}`,
    );

    let usersProcessed = 0;
    let usersFailed = 0;
    for (const row of users) {
      try {
        await this.recomputeForUser(String(row.user_id));
        usersProcessed += 1;
      } catch (err) {
        usersFailed += 1;
        this.logger.error(`validity sweep failed for user ${row.user_id}: ${(err as Error).message}`);
      }
    }
    this.logger.log(`validity sweep done: processed=${usersProcessed} failed=${usersFailed}`);
    return { usersProcessed, usersFailed };
  }
}

async function loadValidityRows(
  sql: Sql,
  userId: string,
  horizonDays: number,
): Promise<{ scans: ValidityScan[]; reports: ValidityReport[] }> {
  // Menu scans are excluded: their overall score describes the whole menu,
  // not a meal the user ate (see validity.ts docstring).
  const scanRows = await sql`
    select id, local_date, overall_risk_score
    from public.scans
    where user_id = ${userId}
      and consumption_status = 'consumed'
      and analysis_status = 'completed'
      and scan_category in ('food', 'grocery')
      and overall_risk_score is not null
      and local_date >= current_date - ${horizonDays}::int`;
  const reportRows = await sql`
    select local_date, gut_severity
    from public.daily_gut_reports
    where user_id = ${userId}
      and local_date >= current_date - ${horizonDays}::int`;

  return {
    scans: scanRows.map((row) => ({
      id: String(row.id),
      localDate: toLocalDate(row.local_date),
      overallRiskScore: Number(row.overall_risk_score),
    })),
    reports: reportRows.map((row) => ({
      localDate: toLocalDate(row.local_date),
      gutSeverity: Number(row.gut_severity),
    })),
  };
}

async function upsertWindowStats(sql: Sql, userId: string, stats: ValidityWindowStats): Promise<void> {
  await sql`
    insert into public.scan_validity_stats
      (user_id, window_days, n_pairs, high_hit_rate, safe_hit_rate, calibration_score, computed_at)
    values
      (${userId}, ${stats.windowDays}, ${stats.nPairs}, ${stats.highHitRate},
       ${stats.safeHitRate}, ${stats.calibrationScore}, now())
    on conflict (user_id, window_days) do update set
      n_pairs = excluded.n_pairs,
      high_hit_rate = excluded.high_hit_rate,
      safe_hit_rate = excluded.safe_hit_rate,
      calibration_score = excluded.calibration_score,
      computed_at = now()`;
}

// postgres.js returns date columns as Date objects.
function toLocalDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : value.toFixed(4);
}

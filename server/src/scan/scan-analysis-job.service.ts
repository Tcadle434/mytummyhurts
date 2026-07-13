import { Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import { DatabaseService } from '../database/database.service';
import type {
  ScanAnalysisJobPayload,
  ScanAnalysisJobRow,
  ScanAnalysisJobStatus,
} from './scan-analysis.types';

export interface BeginQueuedScanInput {
  userId: string;
  requestId: string;
  sourceType: string;
  imageStoragePath?: string | null;
  inputText?: string | null;
  scanCategory: 'food' | 'menu' | 'grocery';
  localDate?: string | null;
  timezone?: string | null;
  payload: ScanAnalysisJobPayload;
}

export interface ScanAnalysisStateRow {
  scan_id: string;
  request_id: string;
  analysis_status: string;
  analysis_stage: string | null;
  analysis_stage_detail: unknown;
  analysis_error_code: string | null;
  analysis_error_message: string | null;
  job_status: ScanAnalysisJobStatus | null;
  reserved_tokens_remaining: number;
  job_error_code: string | null;
  job_last_error: string | null;
}

type LeaseFinalizer = (sql: Sql) => Promise<unknown>;

@Injectable()
export class ScanAnalysisJobService {
  constructor(private readonly db: DatabaseService) {}

  begin(input: BeginQueuedScanInput) {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from public.begin_queued_scan_analysis(
          ${input.userId},
          ${input.requestId},
          ${input.sourceType},
          ${input.imageStoragePath ?? null},
          ${input.inputText ?? null},
          ${input.scanCategory},
          ${input.localDate ?? null},
          ${input.timezone ?? null},
          ${sql.json(input.payload as never)}
        )`;
      return row;
    });
  }

  claimDue(limit: number, workerId: string): Promise<ScanAnalysisJobRow[]> {
    return this.db.service(async (sql) => {
      const rows = await sql`
        select * from public.claim_due_scan_analysis_jobs(${limit}, ${workerId})`;
      return rows as unknown as ScanAnalysisJobRow[];
    });
  }

  claimScan(scanId: string, workerId: string): Promise<ScanAnalysisJobRow[]> {
    return this.db.service(async (sql) => {
      const rows = await sql`select * from public.claim_scan_analysis_job(${scanId}, ${workerId})`;
      return rows as unknown as ScanAnalysisJobRow[];
    });
  }

  complete(jobId: string, attemptCount: number, finalize?: LeaseFinalizer): Promise<boolean> {
    return this.db.serviceTransaction(async (sql) => {
      const owned = await sql`
        select id
        from public.scan_analysis_jobs
        where id = ${jobId}
          and status = 'running'
          and attempt_count = ${attemptCount}
        for update`;
      if (!owned.length) return false;
      if (finalize) await finalize(sql);
      const rows = await sql`
        update public.scan_analysis_jobs
        set status = 'completed',
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            error_code = null,
            last_error = null,
            updated_at = now()
        where id = ${jobId}
          and status = 'running'
          and attempt_count = ${attemptCount}
        returning id`;
      return rows.length === 1;
    });
  }

  fail(
    jobId: string,
    attemptCount: number,
    errorCode: string,
    errorMessage: string,
    finalize?: LeaseFinalizer,
  ): Promise<boolean> {
    return this.db.serviceTransaction(async (sql) => {
      const owned = await sql`
        select id
        from public.scan_analysis_jobs
        where id = ${jobId}
          and status = 'running'
          and attempt_count = ${attemptCount}
        for update`;
      if (!owned.length) return false;
      if (finalize) await finalize(sql);
      const rows = await sql`
        update public.scan_analysis_jobs
        set status = 'failed',
            failed_at = now(),
            locked_at = null,
            locked_by = null,
            error_code = ${errorCode.slice(0, 100)},
            last_error = ${errorMessage.slice(0, 500)},
            updated_at = now()
        where id = ${jobId}
          and status = 'running'
          and attempt_count = ${attemptCount}
        returning id`;
      return rows.length === 1;
    });
  }

  heartbeat(jobId: string, attemptCount: number): Promise<boolean> {
    return this.db.service(async (sql) => {
      const rows = await sql`
        update public.scan_analysis_jobs
        set locked_at = now(),
            updated_at = now()
        where id = ${jobId}
          and status = 'running'
          and attempt_count = ${attemptCount}
        returning id`;
      return rows.length === 1;
    });
  }

  getScanStatus(scanId: string): Promise<string | null> {
    return this.db.service(async (sql) => {
      const [row] = await sql`select analysis_status from public.scans where id = ${scanId}`;
      return typeof row?.analysis_status === 'string' ? row.analysis_status : null;
    });
  }

  setInputText(userId: string, scanId: string, inputText: string, client?: Sql) {
    const update = (sql: Sql) => sql`
        update public.scans
        set input_text = ${inputText}
        where id = ${scanId} and user_id = ${userId} and analysis_status = 'processing'`;
    return client ? update(client) : this.db.service(update);
  }

  getState(userId: string, scanId: string): Promise<ScanAnalysisStateRow | null> {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select
          scans.id as scan_id,
          scans.request_id,
          scans.analysis_status,
          scans.analysis_stage,
          scans.analysis_stage_detail,
          scans.analysis_error_code,
          scans.analysis_error_message,
          jobs.status as job_status,
          coalesce(jobs.reserved_tokens_remaining, users.current_token_balance) as reserved_tokens_remaining,
          jobs.error_code as job_error_code,
          jobs.last_error as job_last_error
        from public.scans scans
        join public.users users on users.id = scans.user_id
        left join public.scan_analysis_jobs jobs on jobs.scan_id = scans.id
        where scans.id = ${scanId} and scans.user_id = ${userId}
        limit 1`;
      return (row as unknown as ScanAnalysisStateRow | undefined) ?? null;
    });
  }
}

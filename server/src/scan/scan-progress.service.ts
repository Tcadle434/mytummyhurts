import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  isScanAnalysisStage,
  type ScanAnalysisStage,
  type ScanStageDetail,
} from './scan-progress';

export type ScanProgressStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'not_found';

export interface ScanProgressSnapshot {
  ok: true;
  stage: ScanAnalysisStage | null;
  ingredientsPreview: string[];
  status: ScanProgressStatus;
}

/**
 * Best-effort progressive-analysis stamps on the scan row. Writes are fire and
 * forget from the pipeline's perspective: a failed stage update must never
 * fail (or slow) the scan itself, so every write is caught and logged here.
 */
@Injectable()
export class ScanProgressService {
  private readonly logger = new Logger('ScanProgress');

  constructor(private readonly db: DatabaseService) {}

  async setStage(
    userId: string,
    scanId: string,
    stage: ScanAnalysisStage,
    detail?: ScanStageDetail,
  ): Promise<void> {
    try {
      await this.db.service(async (sql) => {
        // coalesce keeps an earlier ingredients preview when a later stage
        // update carries no detail of its own.
        await sql`
          update public.scans
          set analysis_stage = ${stage},
              analysis_stage_detail = coalesce(
                ${detail ? sql.json(detail as never) : null},
                analysis_stage_detail
              )
          where id = ${scanId} and user_id = ${userId}`;
      });
    } catch (err) {
      this.logger.warn(
        `[progress] stage update '${stage}' failed for scan ${scanId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getProgress(userId: string, requestId: string): Promise<ScanProgressSnapshot> {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select analysis_stage, analysis_stage_detail, analysis_status
        from public.scans
        where user_id = ${userId} and request_id = ${requestId}
        limit 1`;
      if (!row) {
        // The reservation may not have committed yet — the client keeps its
        // timed copy and polls again.
        return { ok: true as const, stage: null, ingredientsPreview: [], status: 'not_found' as const };
      }
      const detail = (row.analysis_stage_detail ?? {}) as ScanStageDetail;
      const ingredientsPreview = Array.isArray(detail.ingredientsPreview)
        ? detail.ingredientsPreview.filter((name): name is string => typeof name === 'string')
        : [];
      return {
        ok: true as const,
        stage: isScanAnalysisStage(row.analysis_stage) ? row.analysis_stage : null,
        ingredientsPreview,
        status: this.normalizeStatus(row.analysis_status),
      };
    });
  }

  private normalizeStatus(value: unknown): ScanProgressStatus {
    return value === 'queued' || value === 'processing' || value === 'completed' || value === 'failed'
      ? value
      : 'not_found';
  }
}

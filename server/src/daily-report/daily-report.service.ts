import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { mapDailyReport } from '../scan/scan-crud.service';

export interface DailyReportUpsertInput {
  localDate: string;
  gutSeverity: number;
  symptomTags?: string[];
  notes?: string;
  evidenceQuality?: 'typical' | 'unscanned';
}

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger('DailyReport');

  constructor(
    private readonly db: DatabaseService,
    private readonly learning: LearningJobService,
  ) {}

  async upsert(userId: string, req: DailyReportUpsertInput) {
    const localDate = normalizeLocalDate(req.localDate);
    if (req.gutSeverity < 0 || req.gutSeverity > 10) {
      throw new BadRequestException('gut_severity_out_of_range');
    }
    // Symptom-based daily score (higher is better). Food-exposure attribution is
    // layered in by the learning recompute; this is the immediate symptom score.
    const dailyScore = Math.max(0, Math.min(100, Math.round(90 - req.gutSeverity * 8)));

    return this.db.service(async (sql) => {
      const [row] = await sql`
        insert into public.daily_gut_reports
          (user_id, local_date, gut_severity, symptom_tags, notes, evidence_quality,
           daily_score, daily_score_updated_at)
        values (${userId}, ${localDate}::date, ${req.gutSeverity}, ${sql.json(req.symptomTags ?? [])},
                ${req.notes ?? null}, ${req.evidenceQuality ?? 'typical'}, ${dailyScore}, now())
        on conflict (user_id, local_date) do update set
          gut_severity = excluded.gut_severity,
          symptom_tags = excluded.symptom_tags,
          notes = excluded.notes,
          evidence_quality = excluded.evidence_quality,
          daily_score = excluded.daily_score,
          daily_score_updated_at = now(),
          updated_at = now()
        returning *`;
      await this.learning.enqueue({
        userId,
        eventType: 'daily_report_submitted',
        sourceType: 'daily_report',
        sourceId: row.id,
      });
      // A fresh check-in is the moment reality scores the scorer: ask the
      // worker for a predictive-validity pass too. The queue coalesces to one
      // pending job per user, so this rides the job enqueued above — the
      // metadata flag survives even if a later event overwrites event_type.
      // Best-effort: a queue hiccup here must never break the report flow.
      try {
        await this.learning.enqueue({
          userId,
          eventType: 'validity_recompute',
          sourceType: 'daily_report',
          sourceId: row.id,
          metadata: { validityRecompute: true },
        });
      } catch (err) {
        this.logger.warn(`validity enqueue failed for user ${userId}: ${(err as Error).message}`);
      }
      return { ok: true as const, report: mapDailyReport(row), learningSyncStatus: 'queued' as const };
    });
  }
}

function normalizeLocalDate(value: string): string {
  const localDate = value.trim();
  if (!LOCAL_DATE_RE.test(localDate)) {
    throw invalidLocalDate();
  }

  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day || year < 1900 || year > 2100) {
    throw invalidLocalDate();
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw invalidLocalDate();
  }

  return localDate;
}

function invalidLocalDate() {
  return new BadRequestException({
    code: 'invalid_local_date',
    message: 'Choose a valid report date.',
  });
}

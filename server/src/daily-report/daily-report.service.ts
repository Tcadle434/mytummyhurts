import { BadRequestException, Injectable } from '@nestjs/common';

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

@Injectable()
export class DailyReportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly learning: LearningJobService,
  ) {}

  async upsert(userId: string, req: DailyReportUpsertInput) {
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
        values (${userId}, ${req.localDate}, ${req.gutSeverity}, ${sql.json(req.symptomTags ?? [])},
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
      return { ok: true as const, report: mapDailyReport(row), learningSyncStatus: 'queued' as const };
    });
  }
}

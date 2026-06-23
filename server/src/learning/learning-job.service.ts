import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

export interface EnqueueLearningJobInput {
  userId: string;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  runAfterSeconds?: number;
  metadata?: Record<string, unknown>;
}

/** Wraps the learning-job queue RPCs (enqueue + FOR UPDATE SKIP LOCKED claim). */
@Injectable()
export class LearningJobService {
  constructor(private readonly db: DatabaseService) {}

  enqueue(input: EnqueueLearningJobInput) {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from enqueue_learning_job(
          ${input.userId}, ${input.eventType}, ${input.sourceType},
          ${input.sourceId ?? null}, ${input.runAfterSeconds ?? 0},
          ${sql.json((input.metadata ?? {}) as never)})`;
      return row;
    });
  }

  claimDue(limit = 25, workerId: string) {
    return this.db.service(
      (sql) => sql`select * from claim_due_learning_jobs(${limit}, ${workerId})`,
    );
  }

  complete(jobId: string) {
    return this.db.service(
      (sql) => sql`update public.learning_jobs
        set status = 'completed', completed_at = now(), updated_at = now() where id = ${jobId}`,
    );
  }

  fail(jobId: string, error: string) {
    return this.db.service(
      (sql) => sql`update public.learning_jobs
        set status = 'failed', failed_at = now(), last_error = ${error.slice(0, 500)}, updated_at = now()
        where id = ${jobId}`,
    );
  }
}

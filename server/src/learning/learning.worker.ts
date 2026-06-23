import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';

/**
 * Drains the Postgres learning_jobs queue (the durable source of truth) via the
 * FOR UPDATE SKIP LOCKED claim RPC, recomputes insights + gut score per claimed
 * job, and marks the job complete. Enabled by default; set
 * LEARNING_WORKER_ENABLED=false to disable. BullMQ+Redis is the scale-up path.
 */
@Injectable()
export class LearningWorker {
  private readonly logger = new Logger('LearningWorker');
  private running = false;

  constructor(
    private readonly jobs: LearningJobService,
    private readonly recompute: LearningRecomputeService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (process.env.LEARNING_WORKER_ENABLED === 'false' || this.running) return;
    this.running = true;
    try {
      const due = await this.jobs.claimDue(10, `worker-${process.pid}`);
      for (const job of due) {
        try {
          await this.recompute.rebuild(job.user_id, job.source_type ?? 'profile', job.source_id ?? undefined);
          await this.jobs.complete(job.id);
        } catch (err) {
          this.logger.error(`job ${job.id} failed: ${(err as Error).message}`);
          await this.jobs.fail(job.id, (err as Error).message);
        }
      }
      if (due.length) this.logger.log(`processed ${due.length} learning job(s)`);
    } catch (err) {
      this.logger.error(`worker tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}

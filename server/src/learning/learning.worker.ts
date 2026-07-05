import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';
import { ValidityRecomputeService } from './validity-recompute.service';

/**
 * The queue coalesces to ONE pending job per user, so a later enqueue can
 * overwrite event_type while the merged metadata survives. A job asks for a
 * validity pass either way; the rebuild always runs so coalesced learning
 * work is never lost.
 */
export function jobRequestsValidityRecompute(job: {
  event_type?: string | null;
  metadata?: unknown;
}): boolean {
  if (job.event_type === 'validity_recompute') return true;
  const metadata = job.metadata;
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as Record<string, unknown>).validityRecompute === true
  );
}

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
    private readonly validity: ValidityRecomputeService,
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
          if (jobRequestsValidityRecompute(job)) {
            // Best-effort: the scorer-scored-by-reality stats must never fail
            // the learning job that carries them (nightly sweep catches up).
            try {
              await this.validity.recomputeForUser(job.user_id);
            } catch (err) {
              this.logger.warn(
                `validity recompute failed for user ${job.user_id}: ${(err as Error).message}`,
              );
            }
          }
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

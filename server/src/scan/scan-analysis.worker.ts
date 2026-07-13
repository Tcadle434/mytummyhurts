import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ScanAnalysisExecutorService } from './scan-analysis-executor.service';
import { ScanAnalysisJobService } from './scan-analysis-job.service';

function workerConcurrency() {
  const value = Number(process.env.SCAN_ANALYSIS_WORKER_CONCURRENCY);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 10) : 2;
}

@Injectable()
export class ScanAnalysisWorker {
  private readonly logger = new Logger('ScanAnalysisWorker');
  private running = false;

  constructor(
    private readonly jobs: ScanAnalysisJobService,
    private readonly executor: ScanAnalysisExecutorService,
  ) {}

  @Interval(1_000)
  async tick(): Promise<void> {
    if (process.env.SCAN_ANALYSIS_WORKER_ENABLED === 'false' || this.running) return;
    this.running = true;
    try {
      const claimed = await this.jobs.claimDue(
        workerConcurrency(),
        `scan-worker-${process.pid}`,
      );
      await Promise.all(claimed.map((job) => this.executor.execute(job)));
      if (claimed.length) this.logger.log(`processed ${claimed.length} scan analysis job(s)`);
    } catch (error) {
      this.logger.error(`worker tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  kick(): void {
    void this.tick();
  }
}

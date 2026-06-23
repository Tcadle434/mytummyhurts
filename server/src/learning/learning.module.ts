import { Module } from '@nestjs/common';

import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';
import { LearningWorker } from './learning.worker';

@Module({
  providers: [LearningJobService, LearningRecomputeService, LearningWorker],
  exports: [LearningJobService, LearningRecomputeService],
})
export class LearningModule {}

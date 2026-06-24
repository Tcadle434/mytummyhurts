import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';
import { LearningWorker } from './learning.worker';

@Module({
  imports: [TaxonomyModule],
  providers: [LearningJobService, LearningRecomputeService, LearningWorker],
  exports: [LearningJobService, LearningRecomputeService],
})
export class LearningModule {}

import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { LastBadMealExtractionService } from './last-bad-meal-extraction.service';
import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';
import { LearningWorker } from './learning.worker';

@Module({
  imports: [TaxonomyModule],
  providers: [LastBadMealExtractionService, LearningJobService, LearningRecomputeService, LearningWorker],
  exports: [LearningJobService, LearningRecomputeService],
})
export class LearningModule {}

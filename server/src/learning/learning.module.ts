import { Module } from '@nestjs/common';

import { TaxonomyModule } from '../taxonomy/taxonomy.module';
import { LastBadMealExtractionService } from './last-bad-meal-extraction.service';
import { LearningJobService } from './learning-job.service';
import { LearningRecomputeService } from './learning-recompute.service';
import { LearningWorker } from './learning.worker';
import { ValidityRecomputeService } from './validity-recompute.service';

@Module({
  imports: [TaxonomyModule],
  providers: [
    LastBadMealExtractionService,
    LearningJobService,
    LearningRecomputeService,
    ValidityRecomputeService,
    LearningWorker,
  ],
  exports: [LearningJobService, LearningRecomputeService, ValidityRecomputeService],
})
export class LearningModule {}

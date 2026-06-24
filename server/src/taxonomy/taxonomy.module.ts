import { Module } from '@nestjs/common';

import { TaxonomyClassifierService } from './taxonomy-classifier.service';

@Module({
  providers: [TaxonomyClassifierService],
  exports: [TaxonomyClassifierService],
})
export class TaxonomyModule {}

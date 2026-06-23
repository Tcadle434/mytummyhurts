import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { LearningModule } from '../learning/learning.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [BillingModule, LearningModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}

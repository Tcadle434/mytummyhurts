import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { LearningModule } from '../learning/learning.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [BillingModule, LearningModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}

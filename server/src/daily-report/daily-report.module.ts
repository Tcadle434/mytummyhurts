import { Module } from '@nestjs/common';

import { LearningModule } from '../learning/learning.module';
import { DailyReportController } from './daily-report.controller';
import { DailyReportService } from './daily-report.service';

@Module({
  imports: [LearningModule],
  controllers: [DailyReportController],
  providers: [DailyReportService],
})
export class DailyReportModule {}

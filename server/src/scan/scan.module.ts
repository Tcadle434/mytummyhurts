import { Module } from '@nestjs/common';

import { InsightsModule } from '../insights/insights.module';
import { LearningModule } from '../learning/learning.module';
import { LlmModule } from '../llm/llm.module';
import { RagModule } from '../rag/rag.module';
import { StorageModule } from '../storage/storage.module';
import { TraceModule } from '../trace/trace.module';
import { ScanAnalysisService } from './scan-analysis.service';
import { ScanAnalysisExecutorService } from './scan-analysis-executor.service';
import { ScanAnalysisJobService } from './scan-analysis-job.service';
import { ScanAnalysisWorker } from './scan-analysis.worker';
import { ScanController } from './scan.controller';
import { ScanCrudService } from './scan-crud.service';
import { ScanProgressService } from './scan-progress.service';
import { ScanReservationService } from './scan-reservation.service';
import { ScanWorkflowService } from './workflow/scan-workflow.service';

@Module({
  imports: [LlmModule, LearningModule, RagModule, StorageModule, InsightsModule, TraceModule],
  controllers: [ScanController],
  providers: [
    ScanReservationService,
    ScanWorkflowService,
    ScanAnalysisJobService,
    ScanAnalysisExecutorService,
    ScanAnalysisWorker,
    ScanAnalysisService,
    ScanCrudService,
    ScanProgressService,
  ],
  exports: [
    ScanReservationService,
    ScanWorkflowService,
    ScanAnalysisJobService,
    ScanAnalysisService,
    ScanCrudService,
    ScanProgressService,
  ],
})
export class ScanModule {}

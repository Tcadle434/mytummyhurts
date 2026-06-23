import { Module } from '@nestjs/common';

import { RagModule } from '../rag/rag.module';
import { ScanModule } from '../scan/scan.module';
import { EvalRunnerService } from './eval-runner.service';
import { JudgeService } from './judge.service';

@Module({
  imports: [ScanModule, RagModule],
  providers: [EvalRunnerService, JudgeService],
  exports: [EvalRunnerService, JudgeService],
})
export class EvalModule {}

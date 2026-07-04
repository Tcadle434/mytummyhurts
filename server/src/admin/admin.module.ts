import { Module } from '@nestjs/common';

import { EvalModule } from '../eval/eval.module';
import { LearningModule } from '../learning/learning.module';
import { RagModule } from '../rag/rag.module';
import { AdminController } from './admin.controller';
import { InternalSecretGuard } from './internal-secret.guard';

@Module({
  imports: [RagModule, EvalModule, LearningModule],
  controllers: [AdminController],
  providers: [InternalSecretGuard],
})
export class AdminModule {}

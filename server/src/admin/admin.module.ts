import { Module } from '@nestjs/common';

import { EvalModule } from '../eval/eval.module';
import { RagModule } from '../rag/rag.module';
import { AdminController } from './admin.controller';
import { InternalSecretGuard } from './internal-secret.guard';

@Module({
  imports: [RagModule, EvalModule],
  controllers: [AdminController],
  providers: [InternalSecretGuard],
})
export class AdminModule {}

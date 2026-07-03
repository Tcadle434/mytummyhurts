import { Global, Module } from '@nestjs/common';

import { TraceModule } from '../trace/trace.module';
import { LLM_PROVIDER } from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Global()
@Module({
  imports: [TraceModule],
  providers: [{ provide: LLM_PROVIDER, useClass: OpenAiLlmProvider }],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}

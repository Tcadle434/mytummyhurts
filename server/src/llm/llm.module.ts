import { Global, Module } from '@nestjs/common';

import { LLM_PROVIDER } from './llm-provider.interface';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Global()
@Module({
  providers: [{ provide: LLM_PROVIDER, useClass: OpenAiLlmProvider }],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}

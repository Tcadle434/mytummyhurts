import { Module } from '@nestjs/common';

import { LlmModule } from '../llm/llm.module';
import { EMBEDDER, OpenAiEmbedder } from './embedder';
import { RagIngestionService } from './ingestion.service';
import { FallbackReranker, RERANKER } from './reranker';
import { RagRetrievalService } from './retrieval.service';

@Module({
  imports: [LlmModule],
  providers: [
    { provide: EMBEDDER, useClass: OpenAiEmbedder },
    { provide: RERANKER, useClass: FallbackReranker },
    RagRetrievalService,
    RagIngestionService,
  ],
  exports: [EMBEDDER, RERANKER, RagRetrievalService, RagIngestionService],
})
export class RagModule {}

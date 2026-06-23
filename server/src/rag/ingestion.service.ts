import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { chunkDocument } from './chunking';
import { EMBEDDER, Embedder, toVectorLiteral } from './embedder';

export interface IngestInput {
  title: string;
  sourceType: 'pdf' | 'markdown' | 'html' | 'text' | 'web_scrape';
  content: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
  docType?: string | null;
  license?: string | null;
  conditionTags?: string[];
  ingredientTags?: string[];
}

@Injectable()
export class RagIngestionService {
  constructor(
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    private readonly db: DatabaseService,
  ) {}

  async ingest(input: IngestInput): Promise<{ documentId: string; chunks: number; deduped: boolean }> {
    const hash = createHash('sha256').update(input.content).digest('hex');
    const chunks = chunkDocument(input.content);
    const children = chunks.filter((c) => !c.isParent);
    const embeddings = children.length ? await this.embedder.embed(children.map((c) => c.content)) : [];

    return this.db.service(async (sql) => {
      const [existing] = await sql`
        select id from public.rag_documents where content_hash = ${hash} and version = 1`;
      if (existing) return { documentId: existing.id as string, chunks: 0, deduped: true };

      const [doc] = await sql`
        insert into public.rag_documents
          (title, source_type, source_url, source_name, doc_type, license,
           condition_tags, ingredient_tags, content_hash, status)
        values (${input.title}, ${input.sourceType}, ${input.sourceUrl ?? null},
                ${input.sourceName ?? null}, ${input.docType ?? null}, ${input.license ?? null},
                ${input.conditionTags ?? []}, ${input.ingredientTags ?? []}, ${hash}, 'draft')
        returning id`;

      let childIdx = 0;
      for (const c of chunks) {
        const embLiteral = c.isParent ? null : toVectorLiteral(embeddings[childIdx++]);
        await sql`
          insert into public.rag_document_chunks
            (document_id, chunk_index, heading_path, content, token_count, is_parent,
             embedding, condition_tags, ingredient_tags, embedding_model)
          values (${doc.id}, ${c.chunkIndex}, ${c.headingPath}, ${c.content}, ${c.tokenCount},
                  ${c.isParent}, ${embLiteral}::vector, ${input.conditionTags ?? []},
                  ${input.ingredientTags ?? []}, ${this.embedder.model})`;
      }
      return { documentId: doc.id as string, chunks: chunks.length, deduped: false };
    });
  }

  /** Curation gate: only published documents are retrievable. */
  async publish(documentId: string): Promise<void> {
    await this.db.service(
      (sql) =>
        sql`update public.rag_documents set status = 'published', updated_at = now() where id = ${documentId}`,
    );
  }
}

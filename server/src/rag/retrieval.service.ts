import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { EMBEDDER, Embedder, toVectorLiteral } from './embedder';
import { Candidate, RankedCandidate, RERANKER, Reranker } from './reranker';

// Concept/synonym expansion mirroring the scoring domain — so an exact
// ingredient (garlic) also matches conceptual evidence (allium, fructan, FODMAP)
// without over-filtering early.
const SYNONYMS: Record<string, string[]> = {
  garlic: ['allium', 'fructan', 'fodmap'],
  onion: ['allium', 'fructan', 'fodmap'],
  dairy: ['lactose', 'milk'],
  cheese: ['dairy', 'lactose'],
  tomato: ['acidic', 'nightshade'],
  wheat: ['gluten', 'fructan'],
  coffee: ['caffeine', 'acidic'],
};

export interface RetrievalQuery {
  ingredients: string[];
  conditions: string[];
  concepts?: string[];
  scanId?: string | null;
  userId?: string | null;
  evalCaseId?: string | null;
}

@Injectable()
export class RagRetrievalService {
  constructor(
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(RERANKER) private readonly reranker: Reranker,
    private readonly db: DatabaseService,
  ) {}

  buildQueryText(q: RetrievalQuery): { text: string; keywordTerms: string } {
    const expanded = new Set<string>();
    for (const ing of q.ingredients) {
      const key = ing.toLowerCase();
      expanded.add(key);
      for (const syn of SYNONYMS[key] ?? []) expanded.add(syn);
    }
    for (const concept of q.concepts ?? []) {
      const key = concept.toLowerCase();
      expanded.add(key);
      for (const syn of SYNONYMS[key] ?? []) expanded.add(syn);
    }
    const ingredientPart = [...expanded].join(' ');
    const conditionPart = q.conditions.join(' ');
    return {
      text: `${ingredientPart} for a person with ${conditionPart}`.trim(),
      keywordTerms: [...expanded, ...q.conditions].join(' '),
    };
  }

  async retrieve(q: RetrievalQuery, topK = 8): Promise<{ runId: string | null; chunks: RankedCandidate[] }> {
    const { text, keywordTerms } = this.buildQueryText(q);
    const [embedding] = await this.embedder.embed([text]);
    return this.retrieveWithEmbedding(embedding, keywordTerms, text, q, topK);
  }

  /** Test/seam-friendly entry: caller supplies the query embedding directly. */
  async retrieveWithEmbedding(
    embedding: number[],
    keywordTerms: string,
    queryText: string,
    q: RetrievalQuery,
    topK = 8,
  ): Promise<{ runId: string | null; chunks: RankedCandidate[] }> {
    const vec = toVectorLiteral(embedding);
    const candidates = await this.db.service(async (sql) => {
      const rows = await sql<Candidate[]>`
        with vec as (
          select c.id as "chunkId", c.document_id as "documentId", c.content,
                 d.source_name as source, d.title, d.source_url as url,
                 c.heading_path as "headingPath", c.condition_tags as "conditionTags",
                 c.ingredient_tags as "ingredientTags", c.direction,
                 (1 - (c.embedding <=> ${vec}::vector))::real as "vectorScore",
                 0::real as "keywordScore"
          from public.rag_document_chunks c
          join public.rag_documents d on d.id = c.document_id
          where c.is_parent = false and d.status = 'published' and c.embedding is not null
          order by c.embedding <=> ${vec}::vector
          limit 40
        ),
        kw as (
          select c.id as "chunkId", c.document_id as "documentId", c.content,
                 d.source_name as source, d.title, d.source_url as url,
                 c.heading_path as "headingPath", c.condition_tags as "conditionTags",
                 c.ingredient_tags as "ingredientTags", c.direction,
                 0::real as "vectorScore",
                 ts_rank_cd(c.content_tsv, q)::real as "keywordScore"
          from public.rag_document_chunks c
          join public.rag_documents d on d.id = c.document_id,
               websearch_to_tsquery('english', ${keywordTerms}) q
          where c.is_parent = false and d.status = 'published' and c.content_tsv @@ q
          order by "keywordScore" desc
          limit 40
        )
        select "chunkId", "documentId", content, source, title, url, "headingPath",
               "conditionTags", "ingredientTags", direction,
               max("vectorScore") as "vectorScore",
               max("keywordScore") as "keywordScore",
               (0.6 * max("vectorScore") + 0.4 * max("keywordScore"))::real as "hybridScore"
        from (select * from vec union all select * from kw) u
        group by "chunkId", "documentId", content, source, title, url, "headingPath",
                 "conditionTags", "ingredientTags", direction
        order by "hybridScore" desc
        limit 50`;
      return rows;
    });

    // Dedupe identical content, then rerank, then top-k by threshold.
    const seen = new Set<string>();
    const deduped = candidates.filter((c) => {
      const key = c.content.slice(0, 120);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Threshold tuned for real embedding similarities (text-embedding-3-small
    // cosine for related text is typically 0.3–0.5, so hybrid/rerank scores run
    // lower than 1); top-k is the primary cut.
    const ranked = (await this.reranker.rerank(queryText, deduped))
      .filter((c) => c.rerankScore >= 0.12)
      .slice(0, topK);

    const runId = await this.persistRun(q, queryText, deduped.length, ranked);
    return { runId, chunks: ranked };
  }

  private async persistRun(
    q: RetrievalQuery,
    queryText: string,
    candidateCount: number,
    ranked: RankedCandidate[],
  ): Promise<string | null> {
    try {
      return await this.db.service(async (sql) => {
        const [run] = await sql`
          insert into public.rag_retrieval_runs
            (user_id, scan_id, eval_case_id, query_text, embedding_version,
             candidate_count, returned_count, reranker)
          values (${q.userId ?? null}, ${q.scanId ?? null}, ${q.evalCaseId ?? null},
                  ${queryText}, ${this.embedder.model}, ${candidateCount}, ${ranked.length},
                  ${this.reranker.name})
          returning id`;
        for (let i = 0; i < ranked.length; i++) {
          const c = ranked[i];
          await sql`
            insert into public.rag_retrieved_chunks
              (retrieval_run_id, chunk_id, document_id, rank, vector_score, keyword_score,
               hybrid_score, reranker_score, selected)
            values (${run.id}, ${c.chunkId}, ${c.documentId}, ${i}, ${c.vectorScore},
                    ${c.keywordScore}, ${c.hybridScore}, ${c.rerankScore}, true)`;
        }
        return run.id as string;
      });
    } catch {
      return null; // trace/persistence is best-effort; never fail retrieval
    }
  }
}

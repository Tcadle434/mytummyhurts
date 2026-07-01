import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { RagRetrievalService } from '../rag/retrieval.service';
import { buildUserProfileFromSeed, computeScanResultFromStructured } from '../scan/engine/scoring';
import type { ScanResult } from '../scan/engine/domain';
import { ScanWorkflowService } from '../scan/workflow/scan-workflow.service';
import { GoldenCase } from './golden-dataset';
import { JudgeService } from './judge.service';

export interface RetrievalEvalCase {
  name: string;
  ingredients: string[];
  conditions: string[];
  expectedSourceIncludes: string; // substring expected in a retrieved chunk
}

export interface RetrievalEvalSummary {
  total: number;
  hits: number;
  hitRate: number;
  mrrSum: number;
  results: Array<{ name: string; hit: boolean; rank: number | null }>;
}

export interface EvalCaseResult {
  name: string;
  caseClass: GoldenCase['caseClass'];
  score: number;
  passed: boolean;
  hardFailure: boolean;
  reason: string;
}

export interface EvalSummary {
  runId: string | null;
  total: number;
  passed: number;
  hardFailures: number;
  results: EvalCaseResult[];
}

const EVAL_USER = '00000000-0000-0000-0000-000000000000';

/**
 * End-to-end eval runner. Each case runs the real deterministic scoring path via
 * the workflow; LOW/safe controls fail HARD if they read >= medium (false
 * positive); HIGH-trigger cases fail HARD if they read low (false negative).
 * Results are persisted to eval_runs / eval_results.
 */
@Injectable()
export class EvalRunnerService {
  private readonly logger = new Logger('Eval');

  constructor(
    private readonly workflow: ScanWorkflowService,
    private readonly db: DatabaseService,
    private readonly judge: JudgeService,
    private readonly retrieval: RagRetrievalService,
  ) {}

  /**
   * Retrieval eval: for each case, retrieve and check whether an expected source
   * chunk appears in the top-k. Reports hit-rate + MRR. Requires OPENAI_API_KEY
   * (query embeddings) + a published corpus.
   */
  async runRetrievalEval(cases: RetrievalEvalCase[]): Promise<RetrievalEvalSummary> {
    const results: RetrievalEvalSummary['results'] = [];
    let hits = 0;
    let mrrSum = 0;
    for (const c of cases) {
      const { chunks } = await this.retrieval.retrieve({ ingredients: c.ingredients, conditions: c.conditions }, 8);
      const rankIdx = chunks.findIndex(
        (ch) =>
          ch.content.toLowerCase().includes(c.expectedSourceIncludes.toLowerCase()) ||
          (ch.title ?? '').toLowerCase().includes(c.expectedSourceIncludes.toLowerCase()),
      );
      const hit = rankIdx >= 0;
      if (hit) {
        hits++;
        mrrSum += 1 / (rankIdx + 1);
      }
      results.push({ name: c.name, hit, rank: hit ? rankIdx + 1 : null });
    }
    return { total: cases.length, hits, hitRate: cases.length ? hits / cases.length : 0, mrrSum, results };
  }

  private async ensureDataset(key: string): Promise<string> {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        insert into public.eval_datasets (key, description, layer)
        values (${key}, 'Golden scan goldens (auto-seeded)', 'e2e')
        on conflict (key) do update set description = excluded.description
        returning id`;
      return row.id as string;
    });
  }

  private async ensureCase(datasetId: string, c: GoldenCase): Promise<string> {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        insert into public.eval_cases (dataset_id, name, case_class, input, profile, expectations)
        values (${datasetId}, ${c.name}, ${c.caseClass},
                ${sql.json({ kind: 'text', text: c.text })},
                ${sql.json(c.profile)}, ${sql.json(c.expect)})
        on conflict (dataset_id, name) do update set expectations = excluded.expectations
        returning id`;
      return row.id as string;
    });
  }

  async run(cases: GoldenCase[], datasetKey = 'golden_scan_v1'): Promise<EvalSummary> {
    const datasetId = await this.ensureDataset(datasetKey);
    const runId = await this.db.service(async (sql) => {
      const [row] = await sql`
        insert into public.eval_runs (dataset_id, layer, model, prompt_version, status)
        values (${datasetId}, 'e2e', ${process.env.OPENAI_EXTRACTION_MODEL ?? 'fallback'},
                ${process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'n/a'}, 'running')
        returning id`;
      return row.id as string;
    });

    const results: EvalCaseResult[] = [];
    let hardFailures = 0;
    let passed = 0;

    for (const c of cases) {
      const caseId = await this.ensureCase(datasetId, c);
      const profile = buildUserProfileFromSeed({
        userId: 'eval',
        knownConditions: c.profile.conditions,
        knownIngredientSensitivities: c.profile.sensitivities,
        commonSymptoms: [],
        mealContexts: [],
        currentEatingPatterns: [],
        lifestyleFactors: [],
        foodsToReintroduce: [],
      });

      // Deterministic structured fixture (offline scoring eval) when provided,
      // otherwise the full text->extract->score workflow (needs an API key for
      // meaningful high_trigger results).
      let result: ScanResult;
      if (c.structured) {
        result = computeScanResultFromStructured(c.structured(), profile, []);
      } else {
        const wf = await this.workflow.run({
          userId: EVAL_USER,
          kind: 'text',
          text: c.text,
          profile,
          insights: [],
        });
        result = wf.finalResult;
      }
      const score = result.overallRiskScore;
      const flagged = (result.ingredientRisks ?? []).map((i) => i.canonicalName.toLowerCase());

      const inBand = score >= c.expect.riskBandMin && score <= c.expect.riskBandMax;
      const ingredientsOk =
        !c.expect.expectedIngredients ||
        c.expect.expectedIngredients.every((e) => flagged.some((f) => f.includes(e.toLowerCase())));
      const hardFailure =
        (c.caseClass === 'low_safe' && score >= 37) || (c.caseClass === 'high_trigger' && score < 37);
      const ok = inBand && ingredientsOk && !hardFailure;
      if (ok) passed++;
      if (hardFailure) hardFailures++;

      const reason = hardFailure
        ? c.caseClass === 'low_safe'
          ? `FALSE POSITIVE: safe dish scored ${score}`
          : `FALSE LOW: risky dish scored ${score}`
        : ok
          ? 'ok'
          : `out of band/ingredients (score ${score})`;

      results.push({ name: c.name, caseClass: c.caseClass, score, passed: ok, hardFailure, reason });

      // LLM-as-judge generation eval: grounded + safe. Best-effort; skips with no
      // API key. Stores judge prompt/response/explanation for auditability.
      const verdict = await this.judge
        .judge({
          preset: 'groundedness',
          dimension: 'groundedness_safety',
          outputs: result.interpretation ?? '',
          context: `Flagged ingredients (the only ingredients the interpretation may reference): ${flagged.join(', ') || 'none'}`,
          extraRubric:
            'Also assign a failing score (below 0.5) if the output diagnoses a medical condition, ' +
            'references an ingredient outside the flagged list above, ' +
            `or makes any of these forbidden claims: ${(c.expect.forbiddenClaims ?? []).join('; ') || 'none'}.`,
        })
        .catch(() => null);

      await this.db.service(
        (sql) => sql`
          insert into public.eval_results
            (run_id, case_id, passed, hard_failure, score, actual, judge_prompt, judge_response, judge_explanation)
          values (${runId}, ${caseId}, ${ok}, ${hardFailure}, ${score},
                  ${sql.json({ flagged, band: [c.expect.riskBandMin, c.expect.riskBandMax] })},
                  ${verdict?.prompt ?? null}, ${verdict ? sql.json(verdict.raw as never) : null},
                  ${verdict?.explanation ?? null})
          on conflict (run_id, case_id) do nothing`,
      );
    }

    await this.db.service(
      (sql) => sql`
        update public.eval_runs
        set status = ${hardFailures === 0 ? 'passed' : 'failed'},
            totals = ${sql.json({ total: cases.length, passed, hardFailures })},
            finished_at = now()
        where id = ${runId}`,
    );

    return { runId, total: cases.length, passed, hardFailures, results };
  }
}

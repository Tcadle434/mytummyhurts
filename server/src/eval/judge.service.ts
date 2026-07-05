import { Injectable } from '@nestjs/common';

export interface JudgeResult {
  pass: boolean;
  score: number;
  explanation: string;
  prompt: string;
  raw: unknown;
  /**
   * True when no judge actually ran (e.g. no OPENAI_API_KEY). Skipped verdicts
   * must be excluded from pass rates — a skip is not a pass.
   */
  skipped: boolean;
}

export type JudgePreset = 'correctness' | 'hallucination' | 'groundedness' | 'rag_relevance';

export interface JudgeParams {
  /** Which openevals rubric to apply. */
  preset: JudgePreset;
  /** Human-readable label recorded with the verdict (defaults to the preset). */
  dimension?: string;
  /** The task input / user query, if the rubric uses it. */
  inputs?: string;
  /** The generated text under evaluation. */
  outputs: string;
  /** Retrieved/grounding context the output must stay faithful to. */
  context?: string;
  /** Gold reference output, if available. */
  referenceOutputs?: string;
  /** Extra domain rubric appended to the openevals template (e.g. safety rules). */
  extraRubric?: string;
  /** Score at/above which the verdict passes. Default 0.7. */
  passThreshold?: number;
}

const DEFAULT_PASS_THRESHOLD = 0.7;
const DEFAULT_JUDGE_MODEL = 'gpt-4.1-mini';

// tsc with `module: commonjs` downlevels a normal `import()` to `require()`,
// which throws on the ESM-first openevals/langchain v1 packages. This helper
// keeps a genuine dynamic `import()` at runtime regardless of the module target.
const importESM = new Function('specifier', 'return import(specifier)') as <T = unknown>(
  specifier: string,
) => Promise<T>;

/**
 * LLM-as-judge for generation evals (correctness, groundedness, hallucination,
 * RAG context-relevance). Uses openevals' battle-tested rubrics + structured
 * output via `createLLMAsJudge`, returning a continuous 0..1 score plus a
 * pass/fail derived from a threshold. Numeric scan scores stay deterministic
 * elsewhere — this judges explanation quality only.
 *
 * No OPENAI_API_KEY -> a neutral skip so offline eval runs still record.
 */
@Injectable()
export class JudgeService {
  async judge(params: JudgeParams): Promise<JudgeResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    const dimension = params.dimension ?? params.preset;
    const passThreshold = params.passThreshold ?? DEFAULT_PASS_THRESHOLD;

    if (!apiKey) {
      // Neutral skip, NOT a pass: callers must exclude skipped verdicts from
      // pass rates instead of counting a missing key as a perfect score.
      return {
        pass: true,
        score: 0,
        explanation: 'judge skipped (no OPENAI_API_KEY)',
        prompt: `openevals:${params.preset}`,
        raw: null,
        skipped: true,
      };
    }

    const openevals = await importESM<typeof import('openevals')>('openevals');
    const model = process.env.OPENAI_JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
    const promptTemplate = this.buildPromptTemplate(openevals, params);

    try {
      const evaluator = openevals.createLLMAsJudge({
        prompt: promptTemplate,
        feedbackKey: dimension,
        model: `openai:${model}`,
        continuous: true,
      });
      const result = await evaluator({
        inputs: params.inputs ?? '',
        outputs: params.outputs,
        context: params.context ?? '',
        referenceOutputs: params.referenceOutputs ?? '',
      });
      const score = clamp01(Number(result.score ?? 0));
      return {
        pass: score >= passThreshold,
        score,
        explanation: String(result.comment ?? ''),
        prompt: promptTemplate,
        raw: result,
        skipped: false,
      };
    } catch (err) {
      return {
        pass: false,
        score: 0,
        explanation: `judge_error: ${(err as Error).message}`,
        prompt: promptTemplate,
        raw: null,
        skipped: false,
      };
    }
  }

  private buildPromptTemplate(openevals: typeof import('openevals'), params: JudgeParams): string {
    const base = {
      correctness: openevals.CORRECTNESS_PROMPT,
      hallucination: openevals.HALLUCINATION_PROMPT,
      groundedness: openevals.RAG_GROUNDEDNESS_PROMPT,
      rag_relevance: openevals.RAG_RETRIEVAL_RELEVANCE_PROMPT,
    }[params.preset];
    if (!params.extraRubric) return base;
    return `${base}\n\n<AdditionalRules>\n${params.extraRubric}\n</AdditionalRules>\n`;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

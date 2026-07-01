# Evals

MyTummyHurts uses these eval layers:

1. **Golden scan image evals**: blocking score/mechanism checks for real food images.
2. **Retrieval evals**: checks whether RAG retrieves the right nutrition concepts.
3. **Generation judge evals**: optional LLM-as-judge checks for grounded, non-invented explanations, using the [openevals](https://github.com/langchain-ai/openevals) package (see below).
4. **LangSmith experiment tracking**: records golden-scan runs as LangSmith experiments so you can watch score/band/mechanism trends across model and prompt bumps.

## Golden Scan Images

Dataset:

```txt
server/evals/golden/
  images/
  cases.json
  profiles.json
```

Run all golden scan evals:

```bash
npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app
```

For production/VPS evals, use an active eval account:

```bash
SCAN_EVAL_EMAIL='codex-scan-stability@mytummyhurts.app' \
SCAN_EVAL_PASSWORD='...' \
npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app
```

Without an active subscription/token allowance, production rejects scan requests.

Run one case:

```bash
npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app --case chicken_curry_001 --repeat 5
```

List cases and reusable profiles:

```bash
npm --prefix server run eval:scans -- --list
```

Each case should define:

- expected band or allowed bands
- expected score range
- max run-to-run score range
- required mechanisms
- forbidden mechanisms

Use ranges, not exact scores. A real scan can vary because image extraction can vary.

## Adding A New Image

1. Put the image in `server/evals/golden/images/`.
2. Add an entry to `server/evals/golden/cases.json`.
3. Use a profile from `server/evals/golden/profiles.json`.
4. Run the single case with `--repeat 3` or `--repeat 5`.
5. If it fails, fix the general extraction/scoring behavior and keep the case.

Do not add dish-specific scoring hacks. A failed image should become a general rule or a better eval expectation.

## Retrieval Evals

Dataset:

```txt
server/evals/retrieval/cases.json
```

Run:

```bash
npm --prefix server run build
npm --prefix server run eval:retrieval
```

These tests check that RAG returns chunks containing expected concepts, such as `FODMAP`, `fructan`, `reflux`, or `lactose`.

## Optional LLM Judge

Golden scan evals can run a generation-quality judge:

```bash
npm --prefix server run eval:scans -- --case chicken_curry_001 --repeat 3 --judge
```

The judge checks explanation quality only:

- grounded in extracted ingredients
- no invented ingredients
- no diagnosis
- uncertainty is honest
- tiny garnish-level ingredients are not overstated

The judge should not decide numeric scores. Numeric score gates stay deterministic.

The server-side `JudgeService` (`src/eval/judge.service.ts`) uses the
[`openevals`](https://github.com/langchain-ai/openevals) package's
`createLLMAsJudge` with its battle-tested rubrics — `correctness`,
`hallucination`, `groundedness`, `rag_relevance`. It returns a continuous `0..1`
score (with structured reasoning) and a pass/fail from a threshold (default
`0.7`). The judge model is `OPENAI_JUDGE_MODEL` (default `gpt-4.1-mini`); no
`OPENAI_API_KEY` -> a neutral skip.

> openevals pulls in the LangChain v1 line (`@langchain/core` 1.x). The scan
> workflow's `@langchain/langgraph` was upgraded to 1.x to match — its
> `Annotation`/`StateGraph` API is unchanged, so the graph is behavior-identical.

## LangSmith Experiment Tracking

Point-in-time reports can't show whether calibration drifts when you bump a model
(`gpt-5.4-mini` / `gpt-5-mini` / `gpt-4.1-mini`) or a prompt version. This layer
records each golden-scan run as a LangSmith **experiment** on a shared dataset, so
you can compare experiments over time in the LangSmith UI.

```bash
LANGSMITH_API_KEY=... \
SCAN_EVAL_EMAIL='codex-scan-stability@mytummyhurts.app' SCAN_EVAL_PASSWORD='...' \
npm --prefix server run eval:langsmith -- --api https://api.mytummyhurts.app
```

- Uses **only** the curated goldens in `evals/golden/` (no real user PII), so
  shipping inputs to LangSmith is safe.
- Syncs a LangSmith dataset (`mth-golden-scans` by default) from
  `evals/golden/cases.json` — additive, so new golden cases show up automatically.
- Deterministic evaluators only: `expectation_pass`, `band_match`,
  `score_in_range`, and the raw `overall_risk_score` (tracked per case for drift).
  Numeric gates stay the source of truth; this layer visualizes them over time.
- Each experiment is tagged with the extraction/menu/normalization model + prompt
  version (from env) so runs are groupable and comparable.
- Runs sequentially (the eval user's profile is rewritten per case) and requires
  `LANGSMITH_API_KEY` — with no key it prints a notice and exits 0.

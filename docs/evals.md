# Evals

MyTummyHurts uses these evaluation layers:

1. **Golden scan image evals**: blocking score/mechanism checks for real food images.
2. **Retrieval evals**: checks whether RAG retrieves the right nutrition concepts.
3. **Generation judge evals**: optional LLM-as-judge checks for grounded, non-invented explanations, using the [openevals](https://github.com/langchain-ai/openevals) package (see below).
4. **Replay and integration tests**: zero-token coverage for schemas, retries, normalization, scoring, persistence, and rendering contracts.
5. **Unified LangSmith telemetry**: live golden-scan passes are recorded as LangSmith experiments when `LANGSMITH_API_KEY` is set.

## Evaluation cadence

Paid live-model checks are intentionally tiered. The full dataset is not run on every pull request.

| Tier | Trigger | Current size | Purpose |
|---|---|---:|---|
| Deterministic | Every pull request | 0 live scans | Code, schema, scoring, persistence, and dataset integrity |
| Smoke | AI-sensitive PR when marked ready, or label `run-ai-evals` | 8 cases / 13 expectations | Small live-model canary |
| Release | Manual production deployment | 27 cases / about 35 expectations | Blocking fixed anchors plus deterministic rotation |
| Nightly | Monday through Saturday | One of five balanced shards | Full rotating coverage over five nights |
| Full | Sunday or manual major-model check | 56 cases / 71 expectations | Every food, menu, barcode, and unclear-input case |

`server/evals/golden/suites.json` is the source of truth for budgets, fixed anchors, release rotation, and nightly shards. Release rotation is seeded by the evaluated commit SHA, so reruns of the same commit select the same cases.

Current food-image expectations are explicitly classified as `model_ratcheted_regression`. They are useful drift and regression labels, but they are not represented as an independently reviewed medical-accuracy holdout. Independently reviewed labels should be added as a separate frozen holdout rather than silently replacing historical expectations.

## Golden Scan Images

Dataset:

```txt
server/evals/golden/
  images/
  cases.json
  profiles.json
  suites.json
```

Run all golden scan evals against a **local** server (preferred — tests the
checked-out code, not whatever is deployed):

```bash
# One-time local stack (postgres + minio), migrations, build:
docker compose -f server/docker-compose.yml up -d
npm --prefix server run db:migrate
npm --prefix server run build

# Start the API with the local S3 env (server/.env supplies OPENAI_API_KEY):
S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY=mthminio S3_SECRET_KEY=mthminio123 \
S3_BUCKET=meal-images LEARNING_WORKER_ENABLED=false \
npm --prefix server run start:prod &

# Entitle an eval user (fresh sign-ups can't scan: subscription gate), then run:
node server/scripts/eval/seed-eval-user.mjs --api http://localhost:3000 \
  --email scan-evals@local.test --password 'Eval-local-pass-1!'
npm --prefix server run eval:scans -- --api http://localhost:3000 \
  --email scan-evals@local.test --password 'Eval-local-pass-1!' --repeat 2
```

Inline `imageDataUrls` are passed straight through to the LLM (the server does
not depend on OpenAI fetching signed storage URLs), so local MinIO works.

Or against production/VPS with an active eval account:

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

Preview a tier without starting the API or spending tokens:

```bash
npm --prefix server run eval:scans -- --tier smoke --plan
npm --prefix server run eval:scans -- --tier release --seed <commit-sha> --plan
npm --prefix server run eval:scans -- --tier nightly --shard-index 0 --plan
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
- required ingredients (substring needles over extracted rawName/canonicalName)
- forbidden ingredients (classic-hallucination guards, e.g. no `garlic` on plain rice)
- expected persisted scan category and clarity
- menu page count, item coverage, score spread, and false-low item guards

Use ranges, not exact scores. A real scan can vary because image extraction can
vary — but an expectation that spans every band asserts nothing. Keep score
ranges at or under ~45 points wide; when you tighten or re-band a case, record
the reason in the expectation's `notes` field (documentation only — the runner
ignores unknown fields).

> **Phase 2 recalibration (2026-07-04).** The extraction prompts gained band
> anchors + worked calibration examples and the rubric now ships its full
> per-rule boundary definitions (`mytummyhurts_extract_v4`), which eliminated
> the pre-Phase-2 multi-band swings. Every envelope was ratcheted to
> **observed-bands-only** over seven post-anchor full passes (14+ samples
> each): `expectedBands` is the exact set of bands the dish actually
> produced (never-observed bands are the regression signal — e.g. pepperoni
> pizza can no longer read medium), and `expectedScoreRange` is the exact
> span of those bands. Sub-band score precision was tried at observed ±6 and
> demonstrably does not hold at repeat 2 — the extractor's composition read
> (tonkotsu vs plain ramen, naan vs no naan) legitimately moves borderline
> dishes one band, so the band union is the assertion and per-expectation
> `notes` record the sample evidence. The nightly drift baseline was seeded
> from the post-ratchet green pass — drift comparisons against pre-Phase-2
> experiments are expected to shift by design and are not regressions.

With `LANGSMITH_API_KEY` in the environment, **any** of the runs above is also
recorded as a LangSmith experiment tagged with `--context` (default `triage`) —
see [Unified LangSmith telemetry](#unified-langsmith-telemetry). Without the
key the runner prints a one-line notice and runs local-only.

### CI and deploy gates

`.github/workflows/server-ci.yml` is the zero-token pull-request gate. It runs the full server test/build pipeline, the offline scoring goldens, and dry plans for every live tier and nightly shard.

`.github/workflows/ai-eval-smoke.yml` runs the small paid smoke tier only when an AI-sensitive pull request becomes ready for review or receives the `run-ai-evals` label. It does not run on every pushed commit.

`.github/workflows/deploy-production.yml` is the only automated production deployment path. It first calls `.github/workflows/scan-evals.yml` with the release tier. Deployment cannot start unless retrieval and scan evaluations are green. The workflow then deploys the exact evaluated commit using a restricted SSH credential and verifies `/healthz` and `/readyz`.

- Manual: Actions -> scan-evals -> Run workflow and choose a tier.
- Pre-deploy: the production workflow always calls the release tier.
- Scheduled: one nightly shard Monday through Saturday; the complete suite on Sunday.
- Telemetry: configure the optional `LANGSMITH_API_KEY` secret and each gate
  run shows up in LangSmith tagged `context=ci-gate`; with the secret absent
  the runner prints a skip notice and the gate is unaffected.
- Production parity: the workflow ingests the versioned curated corpus and enables retrieval, bounded RAG influence, and risk adjudication before scanning.
- Reports: JSON and Markdown artifacts include commit SHA, corpus tree SHA, model identities, prompt version, feature flags, tier, shard, and repeat count.

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

The retrieval dataset contains labeled positive and wrong-condition document expectations across IBS, GERD, lactose intolerance, celiac disease, histamine sensitivity, and cross-condition mechanisms. The runner reports and gates on:

- precision at K
- recall at K
- reciprocal rank
- nDCG at K
- forbidden-document hits
- required evidence direction when applicable

The live workflow runs retrieval against a freshly ingested copy of the exact curated corpus from the evaluated commit. Fake-embedder integration tests remain useful for wiring, but they are not treated as retrieval-quality evidence.

## Optional LLM Judge

Golden scan evals can run a generation-quality judge:

```bash
npm --prefix server run build   # --judge reuses the compiled JudgeService
npm --prefix server run eval:scans -- --case chicken_curry_001 --repeat 3 --judge
```

The judge checks explanation quality only:

- grounded in extracted ingredients
- no invented ingredients
- no diagnosis
- uncertainty is honest
- tiny garnish-level ingredients are not overstated

The judge should not decide numeric scores. Numeric score gates stay deterministic.

There is exactly ONE judge implementation: the server-side `JudgeService`
(`src/eval/judge.service.ts`), built on the
[`openevals`](https://github.com/langchain-ai/openevals) package's
`createLLMAsJudge` with its battle-tested rubrics — `correctness`,
`hallucination`, `groundedness`, `rag_relevance`. `eval:scans --judge` imports
the compiled service from `dist/` (build first); the old hand-rolled prompt in
the runner was deleted. It returns a continuous `0..1` score (with structured
reasoning) and a pass/fail from a threshold (default `0.7`). The judge model is
`OPENAI_JUDGE_MODEL` (default `gpt-4.1-mini`).

No `OPENAI_API_KEY` -> the verdict comes back `skipped: true` and is **excluded
from pass rates and `--judge-blocking`** (a skip is not a pass). Judge-vs-human
label validation is deliberately deferred: before judge verdicts are allowed to
block anything by default, a batch of judge calls needs grading against founder
labels.

> openevals pulls in the LangChain v1 line (`@langchain/core` 1.x). The scan
> workflow's `@langchain/langgraph` was upgraded to 1.x to match — its
> `Annotation`/`StateGraph` API is unchanged, so the graph is behavior-identical.

## Unified LangSmith telemetry

Point-in-time reports can't show whether calibration drifts when you bump a model
(`gpt-5.4-mini` / `gpt-5-mini`) or a prompt version. Since Phase 3b there is
exactly **one** runner (`run-scan-evals.mjs`, npm `eval:scans`): when
`LANGSMITH_API_KEY` is present in the environment, **every pass** streams itself
to LangSmith as an experiment on the shared `mth-golden-scans` dataset — each
case is pushed as it completes, with deterministic evaluator feedback attached.
No key → a one-line notice and a local-only pass (never a failure). Shared
machinery lives in `server/scripts/eval/langsmith-lib.mjs`.

```bash
LANGSMITH_API_KEY=... \
SCAN_EVAL_EMAIL='codex-scan-stability@mytummyhurts.app' SCAN_EVAL_PASSWORD='...' \
npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app --context triage
```

### Context tags

Every experiment is tagged with **why it ran** (`--context`, default `triage`),
in its name and metadata, so a red `ci-gate` experiment (blocked deploy) is never
confused with a red `triage` experiment (routine local poking):

| Context    | Who sets it                                         | Extra behavior |
|------------|-----------------------------------------------------|----------------|
| `triage`   | default for local/manual runs                       | none |
| `ci-gate`  | `.github/workflows/scan-evals.yml`                  | none (exit 1 already blocks the deploy) |
| `nightly`  | `eval:langsmith` alias / `nightly-langsmith.sh` cron | arms the >1-band drift alarm |
| `baseline` | manual, when intentionally recalibrating            | pair with `--update-drift-baseline` |

Experiments are named `mth-golden-<extraction model>-<context>-<run id>`
(override the head with `--experiment <prefix>`; pick another dataset with
`--dataset <name>`), and metadata carries the extraction/menu model + prompt
version from env so runs stay groupable across bumps.

- Uses **only** the curated goldens in `evals/golden/` (no real user PII), so
  shipping inputs to LangSmith is safe.
- Syncs the LangSmith dataset from `evals/golden/cases.json` — additive, so new
  golden cases show up automatically.
- Deterministic evaluators only: `expectation_pass` (mirrors the canonical
  `validateExpectation` gate), `band_match`, `score_in_range`, and the raw
  `overall_risk_score` (tracked per case for drift). Numeric gates stay the
  source of truth; this layer visualizes them over time.
- Telemetry is best-effort by design: a LangSmith outage degrades to warnings,
  never a red suite.

### Nightly drift alarm

A `--context nightly` pass also compares the run's per-example **mean band**
against a stored baseline (`server/evals/reports/langsmith-drift-baseline.json`,
auto-seeded on the first nightly run) and exits 1 loudly when the mean drift
exceeds **one whole band** — a suite that silently moved from low to medium is
product-breaking. Flags: `--drift-baseline <path>`, `--update-drift-baseline`
(refresh after an intentional calibration change; also works outside nightly).
Filtered runs (`--case`/`--profile`) never seed, update, or judge the baseline.

`npm --prefix server run eval:langsmith` is now a thin alias over the unified
runner: it defaults `--context nightly` and the historical `--repeat 1`, and
keeps the old contract that a missing `LANGSMITH_API_KEY` is a free no-op
(notice + exit 0) rather than a paid local-only pass. All of its old flags
still work.

Nightly and weekly execution is owned by `.github/workflows/scan-evals.yml`, not a VPS cron. GitHub provides failure visibility, artifacts, commit identity, and encrypted secrets in one place. The older VPS wrapper remains available for local triage, but it is not the production scheduler.

## Mining Production Cases

`server/scripts/eval/mine-prod-cases.mjs` seeds `eval_datasets`/`eval_cases`
with real production scans as **provisional** golden candidates: completed food
scans (deduped by title, capped at 40) with their current score/band recorded
as the expectation, tagged `provenance: mined-prod-provisional` for founder
review. It reads production data strictly read-only and writes only to the eval
tables. Connection runs `psql` inside the prod Postgres container over SSH (the
DB port is not published), so it needs non-interactive SSH to the VPS:

```bash
node server/scripts/eval/mine-prod-cases.mjs            # dry run (default)
node server/scripts/eval/mine-prod-cases.mjs --write    # seed the eval tables
```

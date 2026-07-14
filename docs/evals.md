# Evals

MyTummyHurts uses these evaluation layers:

1. **Golden scan image evals**: blocking score/mechanism checks for real food images.
2. **Concern v1 transformation evals**: blocking relational checks over structured food-fact pairs and fixed image pairs.
3. **Retrieval evals**: checks whether RAG retrieves the right nutrition concepts.
4. **Generation judge evals**: optional LLM-as-judge checks for grounded, non-invented explanations, using the [openevals](https://github.com/langchain-ai/openevals) package (see below).
5. **Replay and integration tests**: zero-token coverage for schemas, retries, normalization, scoring, persistence, and rendering contracts.
6. **Unified LangSmith telemetry**: live golden-scan passes are recorded as LangSmith experiments when `LANGSMITH_API_KEY` is set; production concern shadows use the same best-effort trace forwarder outside this eval experiment stream.

## Evaluation cadence

Paid live-model checks are intentionally tiered. The full dataset is not run on every pull request.

| Tier | Trigger | Legacy golden | Concern structured | Concern images | Purpose |
|---|---|---:|---:|---:|---|
| Deterministic | Every pull request | 0 live scans | 0 live pairs | 0 live pairs | Code, schema, scoring, persistence, selection, checksums, and dataset integrity |
| Smoke | AI-sensitive PR opened non-draft or marked ready; label `run-ai-evals` to run now and on later pushes | 8 cases / 13 expectations | 4 pairs | 1 pair | Small live-model canary |
| Release | Every merge to `main`, or manual production deployment | 27 cases / about 35 expectations | 8 pairs | 2 pairs | Blocking fixed anchors plus deterministic legacy rotation |
| Nightly | Monday through Saturday | One of five balanced shards | 2 anchors plus one of four rotating shards | 1 anchor plus one of two rotating shards | Broader rotating coverage |
| Full | Sunday or manual major-model check | 56 cases / 71 expectations | 20 pairs | 6 pairs | Complete legacy and concern coverage |

`server/evals/golden/suites.json` is the source of truth for legacy budgets,
fixed anchors, release rotation, and nightly shards. Release rotation is seeded
by the evaluated commit SHA, so reruns of the same commit select the same cases.
`server/evals/concern-v1/suites.json` independently owns concern tier membership,
nightly anchors and shards, and soft-case ratios.

Current food-image expectations are explicitly classified as `model_ratcheted_regression`. They are useful drift and regression labels, but they are not represented as an independently reviewed medical-accuracy holdout. Independently reviewed labels should be added as a separate frozen holdout rather than silently replacing historical expectations.

## Concern v1 transformations

Concern v1 does not inherit the served engine's score labels. Its structured
suite changes one controlled food fact between two subjects and asserts score,
mechanism, confidence, or unrelated-condition relationships. Its image suite
first verifies the expected extraction difference, then runs each extracted
meal through an independent concern context and applies the linked structured
relationship. This prevents one side from influencing the other.

The datasets are:

```txt
server/evals/concern-v1/
  transformations.json
  image-pairs.json
  suites.json
  images/
```

Run or preview a tier after building the server:

```bash
npm --prefix server run build
npm --prefix server run eval:concern:plan -- --tier release
npm --prefix server run eval:concern -- --tier release
npm --prefix server run eval:concern:images:plan -- --tier release
npm --prefix server run eval:concern:images -- --tier release
```

Use `--case id[,id...]` for targeted structured transformations. The image
runner accepts either an image-pair ID or its transformation ID. Nightly runs
require `--shard-index`; plans validate tier membership and selected image
checksums without spending tokens. Live execution requires `OPENAI_API_KEY`.

Hard transformations require 100 percent. Soft transformations use the ratio
declared for their tier, while every resolved or thrown operational failure
blocks regardless of assertion output. Both runners write JSON reports under
`server/evals/reports/` with selection, assertions, latency, audit stages,
retry and validation summaries, token usage, cost, and raw-response presence.
Raw model output remains only in the underlying audit objects and is not copied
into eval reports.

Image fixtures are fixed generated assets with SHA-256 checksums, prompts,
generation metadata, and completed manual visual review in `image-pairs.json`.
Evaluation and CI never regenerate them. See the
[concern eval runbook](../server/evals/concern-v1/README.md) for maintenance and
the [engine contract](concern-v1.md) for scoring and promotion requirements.

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

Inline `imageDataUrls` are first persisted to object storage. The durable worker
reads those objects back as data URLs for the LLM, so local MinIO works without
requiring OpenAI to fetch a localhost signed URL.

The runner uses the asynchronous start/result endpoints and polls every two
seconds for up to 15 minutes. This exercises the same durable job path as the
current app rather than the blocking compatibility endpoints.

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

`.github/workflows/server-ci.yml` is the zero-token pull-request gate. It runs
the full server test/build pipeline, the offline scoring goldens, and dry plans
for every legacy and concern live tier and nightly shard. Concern image plans
also verify the selected committed checksums. The offline legacy runner forces
concern shadows off before loading the server, so it cannot make an unobserved
model call even when local credentials are present.

`.github/workflows/ai-eval-smoke.yml` runs the small paid smoke tier when an AI-sensitive pull request is opened non-draft, becomes ready for review, or receives the `run-ai-evals` label. It does not re-run on pushed commits by default, so a green smoke result can be stale relative to later pushes; keep the `run-ai-evals` label applied to re-run smoke on every push (in-progress runs are cancelled when new commits arrive). The release gate always re-evaluates before deployment either way.

`.github/workflows/deploy-production.yml` is the only automated production deployment path. Every push to protected `main` triggers it automatically, and `workflow_dispatch` remains available for an intentional redeploy. Freshness guards run before the paid release evaluation and again immediately before deployment, so a run stops if its commit is no longer the head of `main`. The restricted VPS command independently enforces the same equality. Re-running a stale run therefore cannot roll production back; dispatch a fresh run to redeploy the current head. The workflow calls `.github/workflows/scan-evals.yml` with the release tier, and deployment cannot start unless retrieval, legacy scan, concern structured, and concern image evaluations are green. It then deploys the exact evaluated commit and verifies `/healthz` and `/readyz`.

- Manual: Actions -> scan-evals -> Run workflow and choose a tier.
- Pre-deploy: the production workflow always calls the release tier.
- Scheduled: one nightly shard Monday through Saturday; the complete suite on Sunday.
- Telemetry: configure the optional `LANGSMITH_API_KEY` secret and each gate
  run shows up in LangSmith tagged `context=ci-gate`; with the secret absent
  the runner prints a skip notice and the gate is unaffected.
- Production parity: the workflow ingests the versioned curated corpus and enables retrieval, bounded RAG influence, and risk adjudication before legacy scanning. It disables automatic concern shadows for those API scans, then runs both concern suites directly so every paid call is observed and gated.
- Reports: legacy JSON and Markdown artifacts include commit SHA, corpus tree SHA, extraction and menu-stage model identities, extraction and menu prompt versions, feature flags, tier, shard, and repeat count. Concern JSON artifacts include the selected plan, relationship assertions, audit summaries, usage, cost, and operational-failure counts.

## Adding A New Image

1. Put the image in `server/evals/golden/images/`. Cases may also reference
   repository fixtures (`assetRoot: "repo"`), use a multi-page `images` array
   or a `barcode`, and set `autoClassify: true` to exercise the automatic
   food/menu router.
2. Add an entry to `server/evals/golden/cases.json`.
3. Use a profile from `server/evals/golden/profiles.json`.
4. Pick tier membership: new cases join the full tier and nightly rotation
   automatically; `releaseEligible: false` / `nightlyEligible: false` opt out
   of rotation, and the smoke/release anchor lists live in
   `server/evals/golden/suites.json`.
5. Run the single case with `--repeat 3` or `--repeat 5`.
6. If it fails, fix the general extraction/scoring behavior and keep the case.

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

Point-in-time reports can't show whether calibration drifts when you bump the
extraction, menu transcription, or menu analysis model, or either prompt
version. Since Phase 3b there is
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
| `nightly`  | `.github/workflows/scan-evals.yml` schedule / `eval:langsmith` alias | arms the >1-band drift alarm |
| `baseline` | manual, when intentionally recalibrating            | pair with `--update-drift-baseline` |

Experiments are named `mth-golden-<extraction model>-<context>-<run id>`
(override the head with `--experiment <prefix>`; pick another dataset with
`--dataset <name>`), and metadata carries the extraction, menu transcription,
menu analysis, and adjudication model identities; extraction and menu prompt
versions; commit SHA; corpus tree SHA; and RAG/adjudication feature flags from
env so runs stay groupable across bumps.

- Uses **only** the curated goldens in `evals/golden/` (no real user PII), so
  shipping inputs to LangSmith is safe.
- Syncs the LangSmith dataset from `evals/golden/cases.json`: new golden cases
  are added automatically, and edited cases update their existing examples in
  place.
- Deterministic evaluators only: `expectation_pass` (mirrors the canonical
  `validateExpectation` gate), `band_match`, `score_in_range`, and the raw
  `overall_risk_score` (tracked per case for drift). Numeric gates stay the
  source of truth; this layer visualizes them over time.
- Telemetry is best-effort by design: a LangSmith outage degrades to warnings,
  never a red suite.

### Nightly drift alarm

A `--context nightly` pass also compares the run's per-example **mean band**
against a stored baseline (`server/evals/reports/langsmith-drift-baseline.json`,
auto-seeded on the first full-suite nightly pass) and exits 1 loudly when the
mean drift exceeds **one whole band** — a suite that silently moved from low to
medium is product-breaking. Flags: `--drift-baseline <path>`,
`--update-drift-baseline` (refresh after an intentional calibration change;
also works outside nightly). Drift is compared over the example keys shared
with the baseline, so partial nightly shards are still judged. Only a
full-suite run can seed or update the baseline: filtered (`--case`/`--profile`)
or tiered runs refuse `--update-drift-baseline` and skip seeding when no
baseline exists yet.

`npm --prefix server run eval:langsmith` is now a thin alias over the unified
runner: it defaults `--context nightly` and the historical `--repeat 1`, and
keeps the old contract that a missing `LANGSMITH_API_KEY` is a free no-op
(notice + exit 0) rather than a paid local-only pass. All of its old flags
still work.

Nightly and weekly execution is owned by `.github/workflows/scan-evals.yml`, not a VPS cron. GitHub provides failure visibility, artifacts, commit identity, and encrypted secrets in one place. The older VPS wrapper remains available for local triage, but it is not the production scheduler.

**Migration:** remove the old `nightly-langsmith.sh` line from the VPS crontab (`crontab -e` on the VPS) when rolling this out. If it stays installed, the unified runner it now delegates to defaults to the **full** tier, so the stale cron would run the entire paid suite against production every night in parallel with the GitHub shards, silently doubling token spend.

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

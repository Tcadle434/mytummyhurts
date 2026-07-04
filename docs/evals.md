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

Use ranges, not exact scores. A real scan can vary because image extraction can
vary — but an expectation that spans every band asserts nothing. Keep score
ranges at or under ~45 points wide; when you tighten or re-band a case, record
the reason in the expectation's `notes` field (documentation only — the runner
ignores unknown fields).

### Deploy gate (CI)

`.github/workflows/scan-evals.yml` is the blocking gate: it boots the server
from the checkout (pgvector + MinIO services, `OPENAI_API_KEY` from repo
secrets, `DEMO_MODE` deliberately unset) and runs the full golden suite against
`http://localhost:3000` with `--repeat 2`. A red suite exits 1 and fails the
job.

- Manual: Actions -> scan-evals -> Run workflow (optional `repeat` / `cases` inputs).
- Pre-deploy: call it from a deploy workflow via `workflow_call` (pass the
  `OPENAI_API_KEY` secret). Deploys must not proceed on a red suite.
- Cost: ~130 real extractions per run (~$0.50-$1.50), so it is dispatch/call
  only — never on every push. Reports upload as the `scan-eval-reports` artifact.

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

### Nightly drift alarm

The runner also compares this run's per-example **mean band** against a stored
baseline (`server/evals/reports/langsmith-drift-baseline.json`, auto-seeded on
the first run) and exits 1 loudly when the mean drift exceeds **one whole
band** — a suite that silently moved from low to medium is product-breaking.
Flags: `--drift-baseline <path>`, `--update-drift-baseline` (refresh after an
intentional calibration change).

`server/scripts/eval/nightly-langsmith.sh` wraps the run for cron (it refuses
to no-op when `LANGSMITH_API_KEY` is missing). VPS crontab entry:

```cron
15 9 * * * cd /root/app && LANGSMITH_API_KEY=... SCAN_EVAL_EMAIL=codex-scan-stability@mytummyhurts.app SCAN_EVAL_PASSWORD=... bash server/scripts/eval/nightly-langsmith.sh >> /var/log/mth-nightly-evals.log 2>&1
```

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

# Scoring overhaul — execution plan (2026-07-03)

Founder directive: execute all phases without pausing for approval; clean code as
you go; end with a full breakdown. Goal: the best possible scoring system.
Branch: `redesign/app-refresh`. One commit per phase, tests green before commit.

Source reviews (2026-07-03, three-agent audit of prompts / architecture / evals)
found: prod p50 scan 18.9s / $0.0078 with the LLM normalization pass alone at
~65% latency + 32% cost; rubric boundary definitions never delivered to the
model (`promptList()` drops `prompt` fields); severity bands unanchored; golden
eval harness manual, run once, 4/8 red, gating nothing; failed scans write no
audits; missing OPENAI_API_KEY silently fabricates demo meals; RAG influence
(`computeRagAdjustment`) is unwired dead code while citations attach everywhere;
"scoring cache" comment promises a cache that does not exist; adjudication runs
on gpt-4.1-mini, discards the vision model's bands, and never sees amounts.

## Standing decisions (made under founder delegation)

D1 — **Scoring philosophy unifies on the band-anchored hybrid.** The LLM owns
the per-condition band; deterministic mechanism contributors own placement
INSIDE the band; bands are uncrossable by rubric noise. Food and menu scans use
the same band ranges and the same combine rules (align the mild boundary and
the high-gate/soft-cap into one constant set in shared engine code).
Mechanism-only scoring (`SCAN_MECHANISM_SCORING_V1_ENABLED` path) is demoted to
the placement layer + no-key fallback, not a rival philosophy.

D2 — **RAG gets wired or silenced, honestly.** Wire `computeRagAdjustment`
into finalize behind `RAG_INFLUENCE_ENABLED` (default on) with its existing
band guard; citations attach ONLY when a retrieved chunk's ingredientTags match
an extracted ingredient. No matching chunks → no citations shown. Corpus growth
is a content task, out of scope.

D3 — Phase order is 1 → 3 → 2: the eval gate must exist before prompt changes
ship. Phase 2 lands only with the golden suite green (or with explicitly
re-banded expectations, each with a written reason in the eval case file).

## Phase 1 — pipeline surgery (no scoring-behavior change)
Files: server/src/scan/engine/openai.ts, scan-analysis.service.ts,
engine/retry.ts, scoring/menu-scoring.ts (fallbacks), trace/cost services.
1. Delete the LLM normalization call (`normalizeExtractionWithAudit`) from all
   food extraction paths; deterministic `normalizeStructuredFoodFacts` +
   `coerceExtraction` remain. Fold duplicate-merge into foodFactNormalization
   if gaps appear (unit-test it).
2. Missing OPENAI_API_KEY = startup crash (Nest config validation). Demo
   fallbacks (`fallbackExtractionFromImage/Text`) gated behind explicit
   `DEMO_MODE=true`.
3. Persist audits on failure: catch blocks record `err.audit` via
   `trace.recordScanTrace(status:'failed')` before rethrow.
4. Retry tuning: extraction timeout 30s (65s → 30s), retry set gains
   `openai_timeout`, `openai_invalid_json`, `openai_incomplete_output` (capped).
5. `reasoning: { effort: 'low' }` + `verbosity: 'low'` on gpt-5.4-mini
   extraction calls (mirrors menu stage); raise image/text output caps to 6000.
6. Stop requesting condition bands when the active engine discards them —
   band request becomes conditional exactly like `MENU_LLM_BANDS`. (After D1
   unification in Phase 2+, bands are always consumed; keep the lever.)
7. Fix cost-cap double count (`ai_cost_events` only); add embedding cost rows.
8. Remove the phantom "scoring cache" comment; add requestId-keyed determinism
   note instead. Classification router → `gpt-5-nano`, `detail:'low'`, 300 cap.
Acceptance: server tsc/eslint/vitest green; scan-workflow int spec green;
p50 target ~7s verified by reading ai_node_traces after founder's next deploy
(note in breakdown, not blocking).

## Phase 3 — connect the safety net (before Phase 2)
Files: server/evals/golden/cases.json, scripts/eval/*, src/eval/*, .github/workflows.
1. Add `requiredIngredients`/`forbiddenIngredients` to all 50 golden cases
   (runner already enforces). Tighten the loosest expectations (fruit_smoothie
   lactose 24–86 first).
2. Run the full suite (repeat 2–3) with the key from server/.env or the VPS
   env; triage the 4 known reds (lentil_soup legume_gos miss, biryani
   under-score) — fix engine/prompt or re-band with written reasons.
   Commit the green report as baseline under evals/reports/.
3. Judge: keep openevals JudgeService; delete the hand-rolled judge in
   run-scan-evals.mjs; no-key path returns 'skipped' not pass. (Human-label
   validation deferred; note it.)
4. Gate: GitHub Actions job (workflow_dispatch + pre-deploy) running
   `eval:scans` against staging/prod URL, blocking on exit 1. Nightly LangSmith
   cron (VPS crontab entry documented in docs/evals.md) with 1-band drift alarm.
5. Mine prod: script `scripts/eval/mine-prod-cases.mjs` — SELECT completed
   scans + storage_path, dedupe by title, seed eval_cases with current scores
   as provisional expectations (founder reviews later). Read-only against prod;
   writes only to eval tables.

## Phase 3b — unified eval telemetry (founder request, lands right after Phase 3)
Merge the two runners: `run-scan-evals.mjs` gains inline LangSmith reporting —
when LANGSMITH_API_KEY is present, every pass pushes an experiment to the
`mth-golden-scans` dataset AS IT RUNS (per-case results streamed or pushed at
pass end), tagged with a `context` (`triage` | `ci-gate` | `nightly` |
`baseline`) plus the existing model/prompt-version tags; silently skipped when
no key. `run-langsmith-evals.mjs` becomes a thin alias (or is deleted) so there
is exactly one way to run evals and observability is never opt-in. CI gate and
nightly cron collapse onto the unified runner with `--context` flags.

## Phase 2 — prompt upgrades (through the Phase 3 gate)
Files: engine/openai.ts, menuRubric.ts, riskAdjudication.ts.
1. Band anchors: five one-line anchors + none-vs-mild rule + "any band above
   none must cite a driver" (mirror in coerceConditionSeverities: moderate+
   with empty drivers downgrades to mild). 2–3 worked calibration examples.
2. Ship rubric `prompt` fields: promptList() emits label + prompt text
   (confusable rules at minimum); delete the hand-copied header carve-outs.
3. Remove inline extractionSchema from user prompts (~1,400 tok/scan); move
   field anchors into schema `description`s. Meal description becomes the FIRST
   line of the text user prompt.
4. Adjudication: default model gpt-5-mini effort low; user prompt gains
   amountEstimate on ingredients + extraction bands as genericBand prior;
   system prompt gets the explicit finalBand rule. Adjudication becomes the
   band source for food scans (D1), extraction bands the prior, clamps stay.
5. Prominence definition + trace-collision fix (hedged-existence vs tiny
   quantity). dietFitHypothesis maxItems 8→10. knownIngredients: include as
   "check carefully, report only if present" line. Menu: drop required
   per-item severity `rationale` (band+drivers only); delete the "internally
   recount" line.
6. Re-run golden suite; ship only green (or documented re-bands).

## Phase 4 — dosage → day-load
1. Portion on consumption: client consumed confirm gains 'light / normal /
   heavy' (three-option, default normal, one tap). Contracts + liveClient +
   store + server scan-crud consumption update + migration
   (scans.consumption_portion text null check).
2. Dose-weighted learning: insights-learning weighs exposure by portion
   (light 0.6 / normal 1.0 / heavy 1.4 — constants in shared-domain) and by
   scan amountEstimate for the ingredient; day counts stay distinct days.
3. Day-load: new pure module server/src/scan/engine/day-load.ts — same-day
   consumed scans' mechanism loads accumulate; scan result gains a dayLoad
   context (additive field: { mechanismKey, priorMealCount, note }) when the
   same mechanism already appeared in a consumed scan that local day. Surface
   as one line on scan result ("your 2nd dairy hit today — stacking matters").
   No score change in v1 (display + data only) — scoring impact needs eval
   evidence first; note this in the breakdown.
4. Tests: shared-domain constants, learning weights, day-load module, client
   portion flow logic.

## Phase 5 — predictive validity loop
1. New table scan_validity_stats (migration): per user × window: n_pairs,
   band_hit_rate (high/severe scans followed by rough day within 24h),
   safe_hit_rate (low scans followed by calm day), brier-style calibration
   score, computed_at.
2. Nightly job in the learning worker cadence (reuse learning_jobs queue with
   a 'validity_recompute' job type enqueued daily via node-cron in the worker
   or VPS crontab hitting an admin endpoint — pick simplest reliable).
   Pure computation module + spec: joins scans (consumed, completed, banded)
   with daily_gut_reports (same/next local date), computes stats.
3. Expose: admin log line + include latest stats in insights payload metadata
   (additive) for a future UI; document the metric definitions in
   docs/predictive-validity.md. This is the scorer being scored by reality.

## Definition of done
All phases committed separately on redesign/app-refresh; root + server tsc,
eslint, vitest green each commit; golden suite green report committed; full
breakdown message to founder covering: what changed per phase, measured/expected
numbers, decisions D1/D2 with rationale, what was deliberately deferred
(judge human-labeling, RAG corpus growth, day-load scoring influence,
dietitian labels), and deploy notes (migrations, env vars: DEMO_MODE,
RAG_INFLUENCE_ENABLED, eval workflow secrets, crontab lines).

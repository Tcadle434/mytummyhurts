# Concern v1 scoring engine

Concern v1 is a parallel, evidence-grounded scoring engine for food, grocery,
and menu scans. It answers one product question:

> How cautious should this person be about eating this food?

It does not estimate symptom probability, predict symptom severity, diagnose a
condition, or claim that a food is universally safe or unsafe.

## Current rollout state

Concern v1 is experimental and disabled by default. The production engine still
supplies every API and mobile response. When an intentional shadow experiment
enables concern v1, a failure cannot replace, delay, or invalidate a served
result. The executor starts the shadow only after the durable scan and job
completion transaction succeeds, and the result API never waits for it. The
shadow output and its full model audit trail are recorded as a separate
best-effort `scan_concern_shadow` trace.

Shadow execution requires `OPENAI_API_KEY` and an explicit
`CONCERN_V1_SHADOW_ENABLED=on`; `1` and `true` also enable it. Missing, unknown,
or disabled values keep the experiment off. No mobile release, API contract
change, or database migration is required for shadow operation.

Concurrent and queued shadow runs are bounded. A run that cannot obtain a slot
within the configured queue deadline records a failed shadow result instead of
competing with serving traffic or growing an unbounded backlog.

## Decision flow

1. Convert the existing visual or text extraction into neutral food facts.
2. Map only those facts to a controlled set of digestive mechanisms.
3. Retrieve versioned claims by exact condition and mechanism scope.
4. Ask the adjudicator for a generic concern band, then a bounded personal
   adjustment based only on matched paired history with medium or high
   confidence.
5. Ask an independent verifier to accept, lower, or mark the result uncertain.
   The verifier cannot raise concern or introduce a new fact, mechanism, or
   citation.
6. Convert the verified band and position to the shared 0-100 scale with a
   deterministic mapping.
7. For a user with multiple named conditions, use the highest supported
   condition result as the headline while retaining every condition result.

The verifier's final band and position map to the score deterministically:

| Band | Lower | Middle | Upper |
| --- | ---: | ---: | ---: |
| None | 0 | 5 | 10 |
| Mild | 11 | 24 | 36 |
| Moderate | 37 | 50 | 63 |
| High | 64 | 77 | 89 |
| Severe | 90 | 95 | 100 |

The final confidence is the lower of the adjudicator and verifier confidence.
For menu scans, every item retains its own headline and condition breakdown;
subjects are processed in bounded batches.

The supported condition lenses are IBS, GERD or acid reflux, lactose
intolerance, gluten sensitivity, and general gut sensitivity. If a named
condition is present, general discomfort remains symptom context instead of a
second condition that can inflate the headline. General gut sensitivity is the
primary lens only when no named supported condition is available.

## Evidence and uncertainty boundaries

The runtime catalog is
[`server/data/concern-v1/evidence-claims.json`](../server/data/concern-v1/evidence-claims.json).
Each claim has a stable ID, applicable conditions, mechanisms, direction,
strength, limitations, and an authoritative source URL. Retrieval is
deterministic: it keeps claims matching a selected condition and mapped
mechanism, orders high before moderate before limited strength while preserving
catalog order within a strength, then removes duplicates with the same source
URL and normalized summary. Final citations are validated again against the
specific decision condition and mechanism. Multiple sources for the same
underlying mechanism can improve confidence, but never count as separate
severity drivers.

Catalog changes must retain unique `claim_*` IDs, use only supported condition
and mechanism keys, provide complete source metadata, and update the catalog
`version` and `reviewedAt`. A missing or schema-invalid catalog fails only the
shadow during initialization.

Important product rules are enforced across prompts and runtime schemas:

- Unknown sauces and incomplete labels lower confidence. They do not justify
  invented garlic, onion, dairy, gluten, spice, or carbonation.
- A trace garnish does not receive the same concern as a dominant exposure.
- Ingredients sharing one mechanism aggregate dose instead of stacking as
  independent mechanisms.
- Moderate or higher concern requires a food fact, a mapped mechanism, and a
  supporting evidence claim.
- Personal history can move at most one band and only when paired evidence is
  medium or high confidence.
- A personal increase requires more reactive than calm evidence; a decrease
  requires more calm than reactive evidence.
- Gentle ingredients cannot cancel a direct intolerance exposure.
- The verifier can only preserve or lower the adjudicated result.

Every OpenAI stage uses the Responses API, strict structured output, runtime
Zod validation, three total attempts, sanitized corrective feedback, raw
response audits, token usage, and cost accounting. Exhausted validation fails
closed and produces no concern score.

## Runtime configuration

| Variable | Default | Contract |
| --- | --- | --- |
| `CONCERN_V1_SHADOW_ENABLED` | `off` | `1`, `true`, or `on` explicitly enables shadows when `OPENAI_API_KEY` is also present. |
| `OPENAI_CONCERN_MECHANISM_MODEL` | `gpt-5.4-mini` | Model for controlled mechanism mapping. |
| `OPENAI_CONCERN_ADJUDICATION_MODEL` | `gpt-5.4-mini` | Model for generic and personalized condition decisions. |
| `OPENAI_CONCERN_VERIFICATION_MODEL` | `gpt-5.4-mini` | Independent verifier model. |
| `OPENAI_CONCERN_TIMEOUT_MS` | `45000` | Positive per-attempt request timeout in milliseconds. |
| `OPENAI_CONCERN_MAX_OUTPUT_TOKENS` | `6000` | Positive integer output cap per attempt. |
| `OPENAI_CONCERN_BATCH_SIZE` | `12` | Positive integer subjects per model request, capped at 20. |
| `CONCERN_V1_MAX_CONCURRENT_RUNS` | `2` | Positive integer active shadows per process, capped at 10. |
| `CONCERN_V1_MAX_QUEUED_RUNS` | `20` | Positive integer waiting shadows per process, capped at 200. |
| `CONCERN_V1_QUEUE_TIMEOUT_MS` | `30000` | Positive queue wait in milliseconds before the shadow fails as saturated. |

Invalid numeric values fall back to the documented default before hard caps are
applied. These bounds are process-local.

## Failure and observability contract

A completed result records the engine and evidence versions, resolved condition
contexts, generation time, and every subject. Each subject retains its headline
score, band, confidence, driving condition, and full condition array. Condition
rows retain verification status, mechanisms, source facts, evidence claims,
personal-evidence IDs, rationale, and action.

A failed shadow contains `status: failed`, its last lifecycle `stage`, a bounded
machine-readable `code`, and the evidence version when initialization reached
the catalog. Stages are `initialization`, `mechanism_mapping`, `adjudication`,
`verification`, and `finalization`. A failure never contains a normalized
concern score. Queue saturation is an initialization failure with
`code: concern_v1_queue_saturated` and no model audit.

The best-effort trace write stores the full result or failure summary in
`ai_traces`, one `scan_ai_audit_logs` and `ai_node_traces` row per attempted
model stage, and billable usage in `ai_cost_events`. Audits retain request
metadata, retry and validation details, raw provider responses, parsed and
normalized responses, token usage, pricing snapshots, and estimated cost.
Prompt and model versions are registered in their existing version tables. When
LangSmith forwarding is enabled, a shadow with at least one audit is emitted as
its own parent run with child LLM stages. Postgres remains the source of truth,
and neither trace destination can affect the scan.

## Eval strategy

Concern v1 is evaluated with transformations, not by copying the old engine's
golden score labels. A paired test changes one relevant fact and asserts the
relationship between outputs. Examples include removing tomato sauce, reducing
garlic from dominant to trace, changing fried chicken to grilled chicken, and
replacing regular milk with lactose-free milk.

Hard safety and logic invariants require a 100 percent pass rate. Softer
judgment cases use a declared tier-specific ratio. Operational failures always
block. The committed image pairs include checksums, generation provenance,
visual review, extraction assertions, and concern assertions. CI never creates
new images.

| Tier | Structured pairs | Image pairs | Purpose |
| --- | ---: | ---: | --- |
| Smoke | 4 | 1 | Focused PR signal |
| Release | 8 | 2 | Deployment gate |
| Nightly | 2 anchors plus a rotating fourth | 1 anchor plus a rotating half | Broader drift detection |
| Full | 20 | 6 | Scheduled or manual investigation |

Structured soft-case ratios are 0.75 for smoke, 0.875 for release, and 0.85 for
nightly and full. Image soft-case ratios are 1.0 for smoke and release and 0.8
for nightly and full. Hard cases still require 100 percent, and any resolved or
thrown operational failure blocks the run regardless of transformation output.

The legacy golden suite remains a compatibility and regression signal for the
currently served engine. It is not the correctness oracle for concern v1.
See the [concern eval runbook](../server/evals/concern-v1/README.md) for commands,
selection flags, report contents, and fixture maintenance.

## Promotion requirements

Shadow mode should not be promoted solely because CI is green. Promotion needs:

- all hard transformations consistently passing;
- acceptable soft transformation ratios across repeated nightly runs;
- no unsupported mechanisms, citations, or high-confidence claims in sampled
  production traces;
- stable latency, validation retry, failure, token, and cost distributions;
- reviewed examples across every supported condition and scan type;
- a separate product decision about how the existing mobile response maps to
  the new condition-level explanations.

This provides evidence that the product behaves consistently and is grounded
in its stated sources. It is not clinical validation and should not be
described as such.

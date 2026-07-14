# Concern v1 scoring engine

Concern v1 is a parallel, evidence-grounded scoring engine for food, grocery,
and menu scans. It answers one product question:

> How cautious should this person be about eating this food?

It does not estimate symptom probability, predict symptom severity, diagnose a
condition, or claim that a food is universally safe or unsafe.

## Current rollout state

Concern v1 runs in shadow mode. The production engine still supplies every API
and mobile response. A concern-v1 failure therefore cannot replace, delay, or
invalidate a served result. The shadow output and its full model audit trail are
recorded as a separate `scan_concern_shadow` trace after the durable scan result
is complete.

The kill switch is `CONCERN_V1_SHADOW_ENABLED=off`. No mobile release, API
contract change, or database migration is required for shadow operation.
Concurrent and queued shadow runs are bounded. A run that cannot obtain a slot
within the configured queue deadline records a failed shadow result instead of
competing with serving traffic or growing an unbounded backlog.

## Decision flow

1. Convert the existing visual or text extraction into neutral food facts.
2. Map only those facts to a controlled set of digestive mechanisms.
3. Retrieve versioned claims by exact condition and mechanism scope.
4. Ask the adjudicator for a generic concern band, then a bounded personal
   adjustment based only on repeated paired history.
5. Ask an independent verifier to accept, lower, or mark the result uncertain.
   The verifier cannot raise concern or introduce a new fact, mechanism, or
   citation.
6. Convert the verified band and position to the shared 0-100 scale with a
   deterministic mapping.
7. For a user with multiple named conditions, use the highest supported
   condition result as the headline while retaining every condition result.

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
deterministic and condition scoped. Multiple sources for the same underlying
mechanism can improve confidence, but never count as separate severity drivers.

Important product rules are enforced by both prompts and runtime schemas:

- Unknown sauces and incomplete labels lower confidence. They do not justify
  invented garlic, onion, dairy, gluten, spice, or carbonation.
- A trace garnish does not receive the same concern as a dominant exposure.
- Ingredients sharing one mechanism aggregate dose instead of stacking as
  independent mechanisms.
- Moderate or higher concern requires a food fact, a mapped mechanism, and a
  supporting evidence claim.
- Personal history can move at most one band and only when paired evidence is
  medium or high confidence.
- Gentle ingredients cannot cancel a direct intolerance exposure.
- The verifier can only preserve or lower the adjudicated result.

Every OpenAI stage uses the Responses API, strict structured output, runtime
Zod validation, three total attempts, sanitized corrective feedback, raw
response audits, token usage, and cost accounting. Exhausted validation fails
closed and produces no concern score.

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
| Nightly | Rotating fourth | Rotating half | Broader drift detection |
| Full | All | All | Scheduled or manual investigation |

The legacy golden suite remains a compatibility and regression signal for the
currently served engine. It is not the correctness oracle for concern v1.

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

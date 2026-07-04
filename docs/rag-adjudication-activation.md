# Steps 2–4: activate RAG influence + conditional adjudication (2026-07-04)

Corpus is live in prod (29 docs / 161 chunks, direction-tagged). Now wire it in.
Branch redesign/app-refresh. Each step verified against the golden gate, one
commit at the end. Founder authorized live VPS env changes (coordinator does the
deploy after this lands).

## Pipeline facts (verified)
Graph: loadUserContext → generate → normalizeFoodFacts → retrieveEvidence →
adjudicateRisk → score → finalize → END (scan-workflow.service.ts:229-368).
- retrieveEvidence (line 243) builds `ragEvidence: RiskAdjudicationEvidenceChunk[]`
  (chunkId/title/source/url/content/conditionTags/ingredientTags/direction/
  relevanceScore) when RAG_RETRIEVAL_ENABLED. Gated to food/grocery.
- `computeRagAdjustment(baseScore, RagSignal[], {enabled,maxDelta})` in
  engine/rag-influence.ts is tested but UNWIRED. It is band-guarded (37/64) and
  tanh-bounded; citations pass through.
- finalize (line 338) attaches citations from ALL retrieved chunks — not
  filtered to matched ingredients — and never nudges the score.
- adjudicateRisk (line 269) runs only when SCAN_RISK_ADJUDICATION_ENABLED and NOT
  mechanism scoring; when it runs it always makes the LLM call.

## Step 2 — wire RAG influence (bounded, matched-citations only)
1. New pure module engine/rag-signals.ts:
   - `buildRagSignals(extraction, ragEvidence): RagSignal[]` — for each evidence
     chunk, find the extracted ingredient (canonical names from visible+inferred)
     that matches one of the chunk's ingredientTags (normalized, word-boundary,
     reuse the same matching style as mechanismScoring's term match). No match →
     drop the chunk (this is the "citations that vary by dish / survive
     scrutiny" guarantee). matchedIngredient = that ingredient; direction from
     chunk; relevance = relevanceScore; confidence from a small map
     (relevanceScore ≥0.5 → high, ≥0.3 → medium, else low). Neutral-direction
     chunks are kept as citations but contribute 0 to the delta (already handled
     by computeRagAdjustment's sign=0).
   - Unit-test: matched vs unmatched, direction mapping, confidence tiers.
2. New graph node `applyEvidence` between score and finalize (or fold into
   finalize): when RAG_INFLUENCE_ENABLED (new flag, default false), compute
   signals, call computeRagAdjustment(base.overallRiskScore, signals,
   {enabled:true, maxDelta:5}), and write the clamped finalScore back onto the
   result's overall score (respect the existing band — the guard already
   prevents band crossing). Persist the adjustment reason + citations. If
   disabled or no signals: unchanged.
3. Citations: in finalize, when influence ran, citations = the MATCHED signals'
   chunks only (not all retrieved). When influence off but retrieval on, keep
   current behavior. Never show a citation whose ingredient isn't in the dish.
4. Overall-score vs per-condition: v1 nudges the OVERALL risk score only, within
   band. Per-condition band influence is out of scope (note it).

## Step 3 — conditional adjudication
Replace the blanket `enabled` gate with: run the LLM adjudication only when
SCAN_RISK_ADJUDICATION_ENABLED AND adjudicationWorthwhile(...):
  - a learned insight with paired evidence (hasPairedEvidence) matches an
    extracted ingredient (the judgment layer has personal evidence to weigh), OR
  - ragEvidence contains ≥1 matched, non-neutral chunk (real literature to cite).
New pure helper `adjudicationWorthwhile(insights, extraction, ragSignals)` +
tests. Cold-start users (no insights, no matched evidence) skip the 2× call and
keep the fast path — the score still comes from extraction bands + placement.
Keep the D1 replace-bands behavior when it does run.

## Step 4 — synthetic personal-evidence eval cases
1. Runner support: the golden runner sends scans with a profile (conditions) via
   profiles.json. Extend it so a profile (or case) can carry `seedInsights`
   (ingredient + reactive/calm + confidence) that get seeded for the eval user
   before the scan (find how the runner authenticates/creates the user — reuse
   scripts/eval/seed-eval-user.mjs patterns; seed via an admin/test path or
   direct insight rows). If direct seeding is too invasive, document the seam and
   simulate via the adjudication request in an int-style spec instead.
2. Add ≥3 cases: (a) a normally-mild food the user has REACTIVE paired evidence
   for → asserted to nudge UP within band (never crossing); (b) a declared
   trigger with repeated CALM evidence → nudge DOWN within band; (c) a cold-start
   user (no evidence) on the same food → asserted UNCHANGED (adjudication skipped,
   no influence). Each with requiredIngredients + written notes.
3. These gate the influence/adjudication paths the same way the rest of the suite
   gates extraction.

## Verify (the gate is the law)
Determine the flag config the golden suite is green under and match prod to it.
Run the full golden suite (repeat 2) with RAG_RETRIEVAL_ENABLED=1,
RAG_INFLUENCE_ENABLED=1, SCAN_RISK_ADJUDICATION_ENABLED=1, and the mechanism flag
set to whatever the current green baseline uses — the influence guard must not
regress any of the 65 expectations. Triage until green (influence is band-bounded
so it should not cross a band; if it does, that's a bug in the wiring, fix it).
server tsc/eslint/vitest green. Commit once:
'feat(scan): activate bounded RAG influence + conditional adjudication'.
Report the EXACT prod .env flag set the coordinator should apply.

# Golden Scan Evals

This directory is the image benchmark for scan scoring.

Add a new case:

1. Drop the image into `server/evals/golden/images/`, or reference an existing
   repository fixture with `assetRoot: "repo"`. A case may use a single
   `image`, a multi-page `images` array, or a `barcode` (no image at all).
2. Add a case to `server/evals/golden/cases.json`. Set `autoClassify: true` to
   exercise the automatic food/menu router instead of sending an explicit
   `scanCategory`.
3. Use a reusable profile from `server/evals/golden/profiles.json`.
4. Decide tier membership (`server/evals/golden/suites.json`): new cases join
   the full tier and the nightly rotation automatically (`nightlyEligible:
   false` opts out); `releaseEligible: false` keeps a case out of the release
   gate's rotating sample; the smoke and release anchor lists are fixed in
   `suites.json`. Preview the selection with zero tokens:
   `npm --prefix server run eval:scans -- --tier nightly --shard-index 0 --plan`.
5. Run:

```bash
npm --prefix server run eval:scans -- --case <case_id> --repeat 3 --api https://api.mytummyhurts.app
```

On production, set `SCAN_EVAL_EMAIL` and `SCAN_EVAL_PASSWORD` to an active eval account. A new throwaway sign-up may be blocked by the subscription/token gate.

Expect ranges, not exact scores. The useful labels are:

- expected risk band
- expected score range
- required digestive mechanisms
- forbidden digestive mechanisms
- max run-to-run score spread
- required ingredients (substring needles over extracted names; `requiredIngredientMinRuns` relaxes flaky extractions)
- forbidden ingredients (classic-hallucination guards, e.g. no `garlic` on plain rice)
- expected persisted scan category (`expectedScanCategory`) and clarity (`expectedClarity`)
- menu assertions (`menu`): input page count, minimum item count, required item-name patterns, minimum score spread, and false-low guards for high-risk items

When you tighten, loosen, or re-band an expectation, write the reason in the
expectation's `notes` field (documentation only; the runner ignores it).

Do not add one-off scoring hacks for a case. If a case fails, fix the general mechanism/exposure rule and keep the case as permanent coverage.

# Golden Scan Evals

This directory is the image benchmark for scan scoring.

Add a new case:

1. Drop the image into `server/evals/golden/images/`.
2. Add a case to `server/evals/golden/cases.json`.
3. Use a reusable profile from `server/evals/golden/profiles.json`.
4. Run:

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

Do not add one-off scoring hacks for a case. If a case fails, fix the general mechanism/exposure rule and keep the case as permanent coverage.

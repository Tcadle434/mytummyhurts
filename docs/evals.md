# Evals

MyTummyHurts uses three eval layers:

1. **Golden scan image evals**: blocking score/mechanism checks for real food images.
2. **Retrieval evals**: checks whether RAG retrieves the right nutrition concepts.
3. **Generation judge evals**: optional LLM-as-judge checks for grounded, non-invented explanations.

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

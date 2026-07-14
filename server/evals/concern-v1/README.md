# Concern v1 transformation evals

This suite evaluates relationships between paired inputs. It does not copy the
legacy golden suite's score labels and does not treat the current production
engine as ground truth.

Hard cases are safety or logical invariants and must all pass. Soft cases use a
tier-specific pass ratio because model judgments can move within a valid band.
Operational failures always fail the run.

The release tier is intentionally small. The full set rotates through nightly
shards, and the complete suite is reserved for scheduled or manual runs.

`transformations.json` contains structured food-fact pairs.
`image-pairs.json` points to fixed generated image pairs under `images/`. Every
image is checksum protected and visually reviewed. The image runner first
verifies the expected extraction difference, then scores the two extracted
meals in independent concern runs before applying the transformation assertion.
This prevents one side of the pair from influencing the other.

Useful commands:

```sh
npm run build
npm run eval:concern:plan -- --tier smoke
npm run eval:concern -- --tier smoke
npm run eval:concern:images:plan -- --tier smoke
npm run eval:concern:images -- --tier smoke
```

Live runs require `OPENAI_API_KEY` and a current `dist/` build. The default tier
is `full`. Both runners accept:

- `--tier smoke|release|nightly|full`
- `--plan` to validate selection without making model calls
- `--shard-index N` for a nightly shard
- `--case id[,id...]` to bypass tier selection

For structured runs, `--case` accepts transformation IDs. For image runs it
accepts image-pair IDs or their linked transformation IDs. Unknown IDs, invalid
nightly shards, missing visual review, and image checksum mismatches fail before
model execution.

`suites.json` is the source of truth for fixed tier membership, nightly anchors
and shard counts, and minimum soft pass ratios. Hard cases must all pass and any
resolved or thrown operational failure blocks the suite. JSON reports are
written under `evals/reports/` with the selected plan, per-case assertions,
latency, audit stage names, retry and validation summaries, usage, cost, and raw
response presence. Reports intentionally do not copy raw model output.

CI never regenerates image fixtures. Add or update images deliberately with the
generation model, review them visually, record their provenance, and update the
manifest checksums. Each image pair must reference an existing structured
transformation so both modalities enforce the same concern relationship.

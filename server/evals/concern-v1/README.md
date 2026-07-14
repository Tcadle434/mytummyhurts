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
image is checksum protected and visually reviewed. The image runner first verifies
the expected extraction difference, then scores the two extracted meals in
independent concern runs before applying the transformation assertion. This
prevents one side of the pair from influencing the other.

Useful commands:

```sh
npm run build
npm run eval:concern:plan -- --tier smoke
npm run eval:concern -- --tier smoke
npm run eval:concern:images:plan -- --tier smoke
npm run eval:concern:images -- --tier smoke
```

CI never regenerates image fixtures. Add or update images deliberately with the
generation model, review them visually, record their provenance, and update the
manifest checksums.

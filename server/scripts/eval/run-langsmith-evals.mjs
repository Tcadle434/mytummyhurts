#!/usr/bin/env node
/**
 * Nightly alias for the unified golden-scan runner (Phase 3b).
 *
 * `run-scan-evals.mjs` owns everything now — the scans, the deterministic
 * gate, local reports, LangSmith experiment telemetry, and the >1-band
 * mean-drift alarm. This wrapper exists only so the VPS crontab line,
 * nightly-langsmith.sh, and `npm --prefix server run eval:langsmith` keep
 * working unchanged. It:
 *
 *   - defaults `--context nightly` (tags the experiment + arms the drift alarm)
 *   - defaults the historical `--repeat 1` (the unified runner otherwise uses
 *     per-case repeat counts)
 *   - preserves the old contract that a missing LANGSMITH_API_KEY is a free
 *     no-op (notice + exit 0) instead of a paid, local-only eval pass
 *
 * All previous flags keep working because the unified runner accepts a
 * superset: --api, --dataset, --email, --password, --case, --experiment,
 * --repeat, --drift-baseline, --update-drift-baseline.
 */
import { langsmithKeyPresent } from './langsmith-lib.mjs';
import { runScanEvals } from './run-scan-evals.mjs';

const forwarded = process.argv.slice(2);
const wantsHelp = forwarded.includes('--help') || forwarded.includes('-h');

if (!wantsHelp && !langsmithKeyPresent(process.env)) {
  console.log('LANGSMITH_API_KEY is not set — skipping the LangSmith experiment run.');
  console.log('Set LANGSMITH_API_KEY to record one, or run eval:scans directly for a local-only pass.');
  process.exit(0);
}

if (!forwarded.includes('--context')) forwarded.unshift('--context', 'nightly');
if (!forwarded.includes('--repeat')) forwarded.push('--repeat', '1');

runScanEvals([process.argv[0], process.argv[1], ...forwarded]).catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});

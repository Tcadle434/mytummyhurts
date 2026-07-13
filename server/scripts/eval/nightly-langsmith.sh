#!/usr/bin/env bash
# Nightly LangSmith golden-scan drift run.
#
# Records the golden suite as a LangSmith experiment and fails LOUDLY (exit 1)
# when the mean band drift vs the committed baseline exceeds one whole band
# (see run-langsmith-evals.mjs).
#
# Scheduled execution is owned by .github/workflows/scan-evals.yml - do NOT
# install this in the VPS crontab (it runs the FULL tier and would double
# token spend alongside the GitHub schedule). Keep it for manual triage only:
#
#   LANGSMITH_API_KEY=... SCAN_EVAL_EMAIL=... SCAN_EVAL_PASSWORD=... \
#     bash server/scripts/eval/nightly-langsmith.sh
#
# Env:
#   LANGSMITH_API_KEY   required — a silent no-op nightly is worse than a failure.
#   SCAN_EVAL_EMAIL / SCAN_EVAL_PASSWORD  required against production.
#   MTH_EVAL_API        API base URL (default https://api.mytummyhurts.app).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ -z "${LANGSMITH_API_KEY:-}" ]]; then
  echo "nightly-langsmith: LANGSMITH_API_KEY is not set — refusing to no-op silently." >&2
  exit 1
fi

API_URL="${MTH_EVAL_API:-https://api.mytummyhurts.app}"
echo "nightly-langsmith: $(date -u +%FT%TZ) running golden suite against ${API_URL}"

status=0
node scripts/eval/run-langsmith-evals.mjs --api "${API_URL}" --repeat 1 || status=$?

echo "nightly-langsmith: finished with exit ${status}"
exit "${status}"

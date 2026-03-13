#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/supabase/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${PROJECT_URL:-}" || -z "${FOLLOWUP_DISPATCH_SECRET:-}" ]]; then
  echo "PROJECT_URL and FOLLOWUP_DISPATCH_SECRET must be set in ${ENV_FILE}"
  exit 1
fi

curl -sS \
  -X POST \
  "${PROJECT_URL}/functions/v1/scheduled-maintenance" \
  -H "content-type: application/json" \
  -H "x-dispatch-secret: ${FOLLOWUP_DISPATCH_SECRET}" \
  -d '{"limit":40}'

#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/supabase/.env.local"
PROJECT_REF="nisdwzlvofjkqnbreflk"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is not installed."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/supabase/.temp/project-ref" ]]; then
  echo "Linking local workspace to Supabase project ${PROJECT_REF}..."
  supabase link --project-ref "${PROJECT_REF}"
fi

echo "Pushing secrets from ${ENV_FILE}..."
supabase secrets set --env-file "${ENV_FILE}"

set -a
source "${ENV_FILE}"
set +a

if [[ -n "${APNS_AUTH_KEY_PATH:-}" ]]; then
  if [[ ! -f "${APNS_AUTH_KEY_PATH}" ]]; then
    echo "Missing APNs auth key at ${APNS_AUTH_KEY_PATH}"
    exit 1
  fi

  echo "Pushing APNs auth key contents from ${APNS_AUTH_KEY_PATH}..."
  supabase secrets set APNS_AUTH_KEY="$(<"${APNS_AUTH_KEY_PATH}")"
fi

echo "Supabase secrets updated."

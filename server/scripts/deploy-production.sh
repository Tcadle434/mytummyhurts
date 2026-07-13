#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_sha="${1:-}"
readonly repo_root="/root/mytummyhurts"
readonly compose_file="docker-compose.prod.yml"

if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "deploy: expected a full commit SHA" >&2
  exit 64
fi

cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "deploy: tracked production files have local changes" >&2
  exit 1
fi

git checkout main
git merge-base --is-ancestor HEAD "$expected_sha"
git merge --ff-only "$expected_sha"

if [[ "$(git rev-parse HEAD)" != "$expected_sha" ]]; then
  echo "deploy: checkout does not match evaluated commit" >&2
  exit 1
fi

cd server
docker compose -f "$compose_file" build api
docker compose -f "$compose_file" run --rm --no-deps api node scripts/migrate-production.mjs
docker compose -f "$compose_file" up -d --no-deps --force-recreate api
docker compose -f "$compose_file" ps api

echo "deploy: production API is running commit $expected_sha"

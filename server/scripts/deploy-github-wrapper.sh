#!/bin/sh
set -eu

set -- ${SSH_ORIGINAL_COMMAND:-}
if [ "$#" -ne 2 ] || [ "$1" != "deploy" ]; then
  echo "deploy: only the deploy command is allowed" >&2
  exit 64
fi

sha="$2"
case "$sha" in
  ''|*[!0-9a-f]*)
    echo "deploy: invalid commit SHA" >&2
    exit 64
    ;;
esac
if [ "${#sha}" -ne 40 ]; then
  echo "deploy: a full commit SHA is required" >&2
  exit 64
fi

exec 9>/var/lock/mth-deploy.lock
if ! flock -n 9; then
  echo "deploy: another deployment is already running" >&2
  exit 75
fi

cd /root/mytummyhurts
git fetch --quiet origin main
git cat-file -e "$sha^{commit}"
git merge-base --is-ancestor "$sha" origin/main
git show "$sha:server/scripts/deploy-production.sh" | /bin/bash -s -- "$sha"

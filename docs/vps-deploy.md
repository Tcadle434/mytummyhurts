# VPS Deploy & Cutover Runbook

The self-hosted NestJS backend lives in [`/server`](../server). It is self-contained (own `node_modules`) and isolated from the Expo bundle by a Metro blockList.

## Local development

```bash
cd server
cp .env.example .env          # fill secrets (OPENAI_API_KEY, etc.)
docker compose up -d          # postgres+pgvector + minio
npm install
npm run db:migrate            # shim -> 39 supabase migrations -> auth/ai/rag/eval tables -> overrides
npm run start:dev             # http://localhost:3000  (/healthz, /readyz)
```

Test + verify:
```bash
npm test                      # full suite (auth, isolation, RPC concurrency, scoring×48, RAG, eval, ...)
npm run db:isolation-check    # cross-user RLS gate
npm run build && npm run eval -- --offline   # deterministic scoring goldens (0 false positives)
```

## Database migration model

`scripts/migrate.mjs` replays, in order:
1. `db/00_selfhost_shim.sql` — compatibility shim. Redefines `auth.uid()` to read the `app.current_user_id` GUC, stubs `auth`/`storage` schemas + Supabase roles, enables `pgvector`. This is why the 39 existing Supabase migrations replay unchanged.
2. `server/db/migrations/*.sql` — the 39-migration schema history (verbatim from the original project).
3. `db/10_selfhost_auth.sql`, `db/20_ai_rag_eval.sql` — new tables.
4. `db/90_selfhost_overrides.sql` — app roles (`mth_app` under RLS, `mth_service` BYPASSRLS) + grants + `FORCE ROW LEVEL SECURITY`.

## Production deploy

```bash
# On the VPS, in the repo:
cd server
cp .env.example .env          # production secrets; set POSTGRES_PASSWORD, S3_*, JWT_ACCESS_SECRET, ADMIN_API_SECRET
# Edit Caddyfile -> your real API domain.
docker compose -f docker-compose.prod.yml up -d --build
# Build the schema on the prod DB (replays server/db/migrations + self-host SQL):
DATABASE_ADMIN_URL=postgres://mth:...@<vps-db>:5432/mth node server/scripts/migrate.mjs
```

Stack: Caddy (TLS) → `api` (NestJS, worker in-process) → `postgres` (pgvector) + `minio`. Redis/BullMQ is the documented scale-up path for multi-instance.

## Optional: import existing data

A fresh deploy starts with an **empty database** — sign up and go. The repo keeps UUID-preserving import scripts only for the case where you want to pull data from an old Supabase project later. Run `pg_dump` from a Postgres-version-matched host (a newer server over the pooler can mismatch), or use the version-agnostic Node copy (in FK-dependency order):

```bash
# Identities first (preserves user UUIDs — every FK depends on them), then data, then storage:
SUPABASE_DB_URL=... DATABASE_ADMIN_URL=postgres://mth:...@vps/mth node server/scripts/migrate-auth-identities.mjs
pg_dump --data-only --schema=public "$SUPABASE_DB_URL" | psql "$DATABASE_ADMIN_URL"
SUPABASE_S3_ENDPOINT=... SUPABASE_S3_ACCESS_KEY=... SUPABASE_S3_SECRET_KEY=... node server/scripts/migrate-storage.mjs
```

## Frontend — already cut over

The app talks to ONE backend: the NestJS API. `invokeFunction()` in [`src/services/api/liveClient.ts`](../src/services/api/liveClient.ts) `fetch`es `${EXPO_PUBLIC_API_URL}/v1/<name>` with a bearer token (endpoint name maps 1:1 to the path; error envelope `{ error: { code, message, details } }` preserved). Auth ([`src/services/auth/index.ts`](../src/services/auth/index.ts) + [`nestSession.ts`](../src/services/auth/nestSession.ts)) stores access/refresh tokens in `expo-secure-store` and calls `POST /v1/auth/{apple,google,email/sign-in,email/sign-up,refresh,sign-out}`. **Supabase is fully removed from the app** (`@supabase/supabase-js` dropped, `src/services/supabase/` deleted). Set `EXPO_PUBLIC_API_URL` to your API domain and build.

The only thing that can't be validated headlessly is the **on-device OAuth flow** — Apple nonce binding, the Google direct-ID-token flow, and secure-store persistence. Verify sign-in on a simulator/device once the app points at the VPS.

## Rollback

Pre-prod, there are no installed clients to keep alive — rollback is simply redeploying the previous `api` image (and previous app build if needed). There is no Supabase fallback, by design: the VPS is the single backend.

## Landing page (mytummyhurts.app)

The marketing site is **built** from [`web/landing/`](../web/landing/README.md) (Vite + React); `npm run build` there emits the static site into `server/landing/`, which stays committed. Caddy serves that directory unchanged (apex block + www redirect, `./landing` bind mount), so deploying a landing change is: build locally, commit `server/landing/**`, `git pull` on the VPS. `/privacy.html` and `/terms.html` must keep those exact URL shapes — App Store Connect references the privacy URL.

After the pull, run `docker restart mth-prod-caddy-1`. A pull that rewrites `server/landing` can replace the directory inode, and the caddy container keeps the old (now empty) one bind-mounted: the site then 404s everywhere while TLS still works. The restart re-resolves the mount (this exact failure happened on 2026-07-06). Verify with `curl -s https://mytummyhurts.app/privacy.html -o /dev/null -w '%{http_code}'` expecting 200.

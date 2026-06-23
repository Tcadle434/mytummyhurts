# MyTummyHurts Server (NestJS)

Self-hosted backend that replaces the Supabase Edge Functions. Built incrementally per the migration plan (`.claude/plans/you-are-working-in-sprightly-oasis.md`).

This package is intentionally **self-contained** (its own `node_modules`) so installing/building it never perturbs the Expo app's React Native dependency tree. Metro is configured (`../metro.config.js`) to block `server/` from the RN bundle.

## Run locally

```bash
cd server
cp .env.example .env      # fill in secrets
npm install
npm run start:dev         # http://localhost:3000
```

Health checks:
- `GET /healthz` — liveness
- `GET /readyz` — readiness (Postgres/Redis/MinIO indicators added in later phases)

## Scripts
- `npm run build` — compile to `dist/`
- `npm run start:prod` — run compiled server
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest

## Status
- Phase 0 ✅ skeleton + health endpoints
- Phases 1–10 — see the plan file.

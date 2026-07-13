# Predictive validity — the scorer gets scored by reality

Phase 5 of the scoring overhaul (see `docs/scoring-overhaul-plan.md`). Every
other part of the scoring stack asks "is this score plausible?" — this loop
asks the only question that ultimately matters: **when we told this user a
meal was risky, did their next check-in actually go rough?** It converts the
app from plausible scores to provably predictive ones, per user, from their
own data.

Nothing here changes any score. It measures.

- Computation: `server/src/learning/validity.ts` (pure) +
  `server/src/learning/validity-recompute.service.ts` (load/persist)
- Storage: `public.scan_validity_stats`
  (migration `20260703150000_scan_validity_stats.sql`)
- Specs: `server/test/validity.spec.ts` (hand-computed fixtures),
  `server/test/validity-recompute.int.spec.ts` (DB round-trip, queue flag,
  sweep, RLS)

## The join: which scan meets which check-in

**Eligible scans** — the user said "I ate this" and we scored it:

```sql
consumption_status = 'consumed'
and analysis_status = 'completed'
and scan_category in ('food', 'grocery')   -- menu excluded, see below
and overall_risk_score is not null
```

Menu scans are excluded even when consumed: a menu scan's overall score
describes the whole menu, not the dish the user ordered, so pairing it with
outcomes would pollute the metric.

**Attribution window** — each eligible scan looks for daily check-ins
(`daily_gut_reports`) on the scan's `local_date` **or the next local date**.
These are the two top-weighted lags of `DAILY_ATTRIBUTION_WINDOWS` (0.55 /
0.30), which is how the learning engine already attributes outcomes to food.

- **Pair** — an eligible scan with at least one check-in in its window. Scans
  with no check-in are *unpaired* and excluded from everything: reality never
  weighed in, so it neither confirms nor refutes.
- **Outcome** — the **worst** (max) `gut_severity` across the window's
  check-ins. Deliberate: a high-band call predicts trouble within ~24h, so any
  rough day in the window is a hit — and a "safe" call only fully holds if the
  whole window stayed calm.

Outcome classes use the learning engine's `severityKind` edges:

| gut_severity | outcome |
|---|---|
| >= 7 | rough |
| 4-6 | neutral |
| <= 3 | calm |

**Neutral handling** — a neutral day neither confirms nor refutes a
prediction, so neutral pairs sit out of both hit rates *and* the calibration
score. They **do** count in `n_pairs`, the honest "how much has reality scored
us" denominator.

Band edges come from the shared band geometry (`CONDITION_BAND_RANGES`):
high/severe = `overall_risk_score >= 64`, low = `<= 36`. Moderate-band pairs
(37-63) appear in `n_pairs` and calibration but in neither hit rate.

## The metrics (per user × trailing window)

Windows: trailing **30** and **90** days of scan `local_date`, inclusive of
the compute day (the server's UTC date; `local_date` is user-local, so the
window edge can skew by up to a day — acceptable for a trailing aggregate).

| column | definition |
|---|---|
| `n_pairs` | all pairs in the window, neutral outcomes included |
| `high_hit_rate` | high/severe-band pairs followed by a **rough** outcome ÷ high/severe-band pairs with a decisive (rough or calm) outcome. Null until one exists. |
| `safe_hit_rate` | low-band pairs followed by a **calm** outcome ÷ low-band pairs with a decisive outcome. Null until one exists. |
| `calibration_score` | Brier-style: mean of `(overall_risk_score/100 − roughFlag)²` over **all** decisive pairs, where `roughFlag` is 1 for rough, 0 for calm. Null until one decisive pair exists. |

### How to read calibration_score

The scan score doubles as a predicted probability of a rough follow-up
(`overall_risk_score / 100`), and the Brier score is its mean squared error
against what actually happened:

- **0.00** — perfect: confident calls, always right.
- **< 0.10** — strong: scores are genuinely informative for this user.
- **≈ 0.25** — no better than always answering "50". The scorer isn't adding
  signal for this user yet (or the data is still thin — check `n_pairs`).
- **> 0.25** — actively miscalibrated: confident calls going the wrong way.

Read it with `n_pairs`. A calibration of 0.05 over 3 pairs is an anecdote; the
same number over 40 pairs is evidence.

## Cadence: when stats are recomputed

1. **On every daily check-in** — the moment reality scores the scorer.
   `DailyReportService.upsert` enqueues a `validity_recompute` learning job
   right after the usual learning job. The `learning_jobs` queue coalesces to
   one pending job per user, so the request rides as a metadata flag
   (`validityRecompute: true`) that survives a later event overwriting
   `event_type`; the worker (`learning.worker.ts`) always runs the learning
   rebuild and additionally recomputes validity when the flag (or job type) is
   present. Best-effort on both sides: a validity failure logs and never fails
   the report flow or the learning job.
2. **Nightly all-users sweep** — `POST /v1/admin/validity/sweep` (admin
   secret; iterates every user with a consumed completed scan in the last 90
   days, per-user failures isolated). This also keeps the *windows* honest:
   stats drift as old scans age out even when the user logs nothing new.

VPS crontab line (03:20 UTC nightly; adjust the repo path):

```cron
20 3 * * * curl -fsS -m 600 -X POST https://api.mytummyhurts.app/v1/admin/validity/sweep -H "x-internal-secret: $(grep -m1 '^ADMIN_API_SECRET=' /root/app/server/.env | cut -d= -f2-)" >> /var/log/mth-validity-sweep.log 2>&1
```

Each recompute also emits an admin log line per window
(`validity user=… window=30d pairs=… highHit=… safeHit=… calibration=…`), so
`docker logs` answers "is the scorer honest?" at a glance.

## Exposure (data only in this phase)

The insights payload additively carries the user's latest **30-day** stats at
`profile.stomachProfile.metadata.predictiveValidity`
(`PredictiveValidityStats` in `@mth/shared-domain`): `{ windowDays, nPairs,
highHitRate, safeHitRate, calibrationScore, computedAt }`. Absent until the
first recompute lands; rates null until a decisive pair exists.

**No UI in this phase.** The intended future surface is a single trust line —
*"your scores have predicted your rough days N of M times"* — where N =
`highHitRate` numerator and M its denominator over the window, shown only once
`n_pairs` clears a floor (suggest >= 5) so we never brag on an anecdote. It
also gates future scoring changes: a tweak that improves the golden suite but
degrades live `calibration_score` is a regression.

## Deploy notes

- **Migration**: `server/db/migrations/20260703150000_scan_validity_stats.sql`
  (new table + read-own RLS + a partial index on consumed completed scans).
  Applied by `scripts/migrate.mjs` during a local/CI rebuild or by the
  incremental `scripts/migrate-production.mjs` runner in production.
- **Crontab**: add the nightly sweep line above on the VPS. No new env vars;
  the endpoint reuses `ADMIN_API_SECRET`.

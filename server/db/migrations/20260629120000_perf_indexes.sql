-- Performance indexes (codebase-quality Phase 3).
-- Additive and behavior-preserving: indexes only, no data or schema-shape changes.

-- Sign-out / token-reuse revocation: TokenService.revokeFamilyByToken and rotate()
-- run `update auth_refresh_tokens set revoked_at = now() where family_id = (...) and
-- revoked_at is null`. The existing (user_id, family_id) index cannot serve a
-- family_id-only predicate, so every revocation scans the family rows. A partial
-- index matching the WHERE clause keeps it index-only.
create index if not exists auth_refresh_tokens_family_idx
  on public.auth_refresh_tokens (family_id)
  where revoked_at is null;

-- complete_reserved_scan_analysis deletes child rows by (scan_id, user_id), but the
-- existing indexes on these tables are (scan_id, display_order) — the user_id
-- predicate forces a per-row heap lookup on every scan completion. Add covering
-- (scan_id, user_id) indexes; keep the display_order indexes for SELECT ordering.
create index if not exists scan_condition_risks_scan_user_idx
  on public.scan_condition_risks (scan_id, user_id);
create index if not exists scan_diet_evaluations_scan_user_idx
  on public.scan_diet_evaluations (scan_id, user_id);

-- scan_inputs.thumbnail_storage_path is only ever SELECTed by name, never used as a
-- query predicate, so its partial index only adds write overhead. Drop it.
drop index if exists public.scan_inputs_thumbnail_storage_path_idx;

// Injection tokens for the two runtime Postgres connections:
// - PG_SCOPED:  app role (mth_app), subject to RLS; used for user-scoped queries.
// - PG_SERVICE: service role (mth_service), bypasses RLS; background/cross-user.
export const PG_SCOPED = Symbol('PG_SCOPED');
export const PG_SERVICE = Symbol('PG_SERVICE');

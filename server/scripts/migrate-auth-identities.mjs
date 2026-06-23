// Cutover backfill: import existing Supabase auth.users into our self-host auth
// tables, PRESERVING user UUIDs (every public.* FK depends on them).
//
//   SUPABASE_DB_URL=postgres://...supabase-direct-connection...  \
//   DATABASE_ADMIN_URL=postgres://mth:mth@localhost:5432/mth     \
//   node scripts/migrate-auth-identities.mjs
//
// SUPABASE_DB_URL must be a DIRECT Postgres connection to the Supabase project
// (the auth schema is not exposed via PostgREST). Idempotent.
import postgres from 'postgres';

const sourceUrl = process.env.SUPABASE_DB_URL;
const targetUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';

if (!sourceUrl) {
  console.error('Set SUPABASE_DB_URL (direct Supabase Postgres connection).');
  process.exit(1);
}

// Supabase pooler requires SSL + non-prepared statements.
const source = postgres(sourceUrl, { max: 1, onnotice: () => {}, ssl: 'require', prepare: false });
const target = postgres(targetUrl, { max: 1, onnotice: () => {} });

try {
  const users = await source`
    select id, email, encrypted_password,
           coalesce(raw_app_meta_data->>'provider', 'email') as provider
    from auth.users where deleted_at is null`;
  // Provider linkages live in the separate auth.identities table.
  const identityRows = await source`select user_id, provider, identity_data from auth.identities`;
  const identitiesByUser = new Map();
  for (const row of identityRows) {
    const list = identitiesByUser.get(row.user_id) ?? [];
    list.push(row);
    identitiesByUser.set(row.user_id, list);
  }
  console.log(`Source has ${users.length} auth users, ${identityRows.length} identities.`);

  let identities = 0;
  let creds = 0;
  for (const u of users) {
    // public.users is migrated separately (data copy); ensure a row exists.
    await target`
      insert into public.users (id, email) values (${u.id}, ${u.email})
      on conflict (id) do nothing`;
    await target`
      insert into public.user_profiles (user_id) values (${u.id})
      on conflict (user_id) do nothing`;

    // Provider identities (apple/google) from auth.identities.
    const list = identitiesByUser.get(u.id) ?? [];
    for (const ident of list) {
      const provider = ident.provider;
      const subject = ident.identity_data?.sub ?? ident.provider_id ?? ident.id;
      if (!provider || !subject) continue;
      if (!['apple', 'google', 'email'].includes(provider)) continue;
      await target`
        insert into public.auth_identities (user_id, provider, provider_subject, email)
        values (${u.id}, ${provider}, ${subject}, ${ident.identity_data?.email ?? u.email})
        on conflict (provider, provider_subject) do nothing`;
      identities++;
    }

    // Email identity + legacy bcrypt credential (re-hashed to scrypt on login).
    if (u.email) {
      await target`
        insert into public.auth_identities (user_id, provider, provider_subject, email)
        values (${u.id}, 'email', ${u.email.toLowerCase()}, ${u.email})
        on conflict (provider, provider_subject) do nothing`;
      if (u.encrypted_password) {
        await target`
          insert into public.auth_credentials (user_id, password_hash, algo)
          values (${u.id}, ${u.encrypted_password}, 'bcrypt')
          on conflict (user_id) do nothing`;
        creds++;
      }
    }
  }
  console.log(`Backfilled ${identities} identities, ${creds} bcrypt credentials.`);
} catch (err) {
  console.error('backfill error:', err.message);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}

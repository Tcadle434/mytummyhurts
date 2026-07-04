#!/usr/bin/env node
/**
 * Provision an entitled eval user for golden-scan runs against a LOCAL/CI API.
 *
 * Scan reservation requires subscription_status in (trialing|active|in_grace)
 * plus token balance, so a fresh sign-up cannot scan. This signs the user up
 * through the real API (proper password hash) and then grants entitlement +
 * a deep token balance directly via DATABASE_ADMIN_URL. Never point this at
 * production — it refuses api.mytummyhurts.app.
 *
 *   node scripts/eval/seed-eval-user.mjs --api http://localhost:3000 \
 *     --email scan-evals@ci.local --password 'Eval-ci-pass-1!'
 */
import postgres from 'postgres';

import { signInOrSignUp } from './run-scan-evals.mjs';

const TOKEN_BALANCE = 100000;

function parseArgs(argv) {
  const args = {
    api: process.env.API_URL || 'http://localhost:3000',
    email: process.env.SCAN_EVAL_EMAIL || 'scan-evals@ci.local',
    password: process.env.SCAN_EVAL_PASSWORD || 'Eval-ci-pass-1!',
    adminUrl: process.env.DATABASE_ADMIN_URL || 'postgres://mth:mth@localhost:5432/mth',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--api') { args.api = next; i += 1; continue; }
    if (token === '--email') { args.email = next; i += 1; continue; }
    if (token === '--password') { args.password = next; i += 1; continue; }
    if (token === '--admin-url') { args.adminUrl = next; i += 1; continue; }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.api.includes('api.mytummyhurts.app')) {
  throw new Error('seed-eval-user is for local/CI stacks only — never entitle users on production.');
}

const auth = await signInOrSignUp(args.api, args.email, args.password);
const userId = auth.user?.id;
if (!userId) throw new Error('sign-up did not return a user id');

const sql = postgres(args.adminUrl, { max: 1, onnotice: () => {} });
try {
  await sql`
    update public.users
    set subscription_status = 'active', current_token_balance = ${TOKEN_BALANCE}
    where id = ${userId}`;
  console.log(`eval user ready: ${args.email} (${userId}) active, balance ${TOKEN_BALANCE}`);
} finally {
  await sql.end();
}

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const appRoot = path.resolve(__dirname, '..');
const envPath = path.join(appRoot, 'supabase', '.env.local');

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function parseArgs(argv) {
  const args = {
    score: 72,
    userId: undefined,
    email: undefined,
    trend: undefined,
    listUsers: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--list-users') {
      args.listUsers = true;
      continue;
    }

    if (arg === '--score') {
      args.score = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--trend') {
      args.trend = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--user-id') {
      args.userId = next;
      index += 1;
      continue;
    }

    if (arg === '--email') {
      args.email = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.score) || args.score < 0 || args.score > 100) {
    throw new Error('--score must be an integer from 0 to 100');
  }

  if (typeof args.trend !== 'undefined' && !Number.isInteger(args.trend)) {
    throw new Error('--trend must be an integer');
  }

  return args;
}

function printHelp() {
  console.log(`Seed mock Gut Score snapshots for a Supabase user.

Usage:
  node scripts/seed_gut_score_snapshot.js [--score 72] [--trend 5] [--email user@example.com]
  node scripts/seed_gut_score_snapshot.js --score 38 --trend -6 --user-id <uuid>
  node scripts/seed_gut_score_snapshot.js --list-users

Defaults:
  --score 72
  --trend is inferred from score: low=-6, medium=0, high=5
  user defaults to the most recently seen public.users row
`);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function scoreZone(score) {
  if (score <= 33) return 'low';
  if (score <= 66) return 'medium';
  return 'high';
}

function inferredTrend(score) {
  const zone = scoreZone(score);
  if (zone === 'low') return -6;
  if (zone === 'medium') return 0;
  return 5;
}

function phaseForScore(score) {
  const zone = scoreZone(score);
  if (zone === 'low') return 'reintroduce';
  if (zone === 'medium') return 'learn';
  return 'learn';
}

function trendDirection(delta) {
  if (delta <= -2) return 'down';
  if (delta >= 2) return 'up';
  return 'flat';
}

function componentsForScore(score) {
  const zone = scoreZone(score);

  if (zone === 'low') {
    return {
      symptomBurden: 12,
      triggerLoad: 18,
      symptomFreeConsistency: 86,
      toleranceTrend: 76,
      uncertainty: 14,
    };
  }

  if (zone === 'medium') {
    return {
      symptomBurden: 42,
      triggerLoad: 48,
      symptomFreeConsistency: 52,
      toleranceTrend: 46,
      uncertainty: 30,
    };
  }

  return {
    symptomBurden: 74,
    triggerLoad: 68,
    symptomFreeConsistency: 24,
    toleranceTrend: 22,
    uncertainty: 38,
  };
}

function driversForScore(score) {
  const zone = scoreZone(score);

  if (zone === 'low') {
    return [
      {
        key: 'mock-consistency',
        label: 'More calm follow-ups',
        detail: 'Recent reports show fewer symptoms after meals.',
        impact: 'lowers',
        weight: 0.38,
      },
    ];
  }

  if (zone === 'medium') {
    return [
      {
        key: 'mock-learning',
        label: 'Mixed meal reports',
        detail: 'Your recent scans and reports show a mixed reactivity pattern.',
        impact: 'neutral',
        weight: 0.28,
      },
    ];
  }

  return [
    {
      key: 'mock-reactivity',
      label: 'Higher recent reactivity',
      detail: 'Recent reports suggest your gut is more reactive right now.',
      impact: 'raises',
      weight: 0.42,
    },
  ];
}

async function findUser(supabase, args) {
  let query = supabase.from('users').select('id,email,last_seen_at,created_at');

  if (args.userId) {
    query = query.eq('id', args.userId).limit(1);
  } else if (args.email) {
    query = query.eq('email', args.email).limit(1);
  } else {
    query = query.order('last_seen_at', { ascending: false }).limit(1);
  }

  const { data, error } = await query;
  if (error) throw error;

  const user = data?.[0];
  if (!user) {
    throw new Error('No matching user found.');
  }

  return user;
}

async function listUsers(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id,email,last_seen_at,created_at')
    .order('last_seen_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  console.table(data ?? []);
}

async function ensureProfileRow(supabase, userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id,stomach_profile_blob')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('user_profiles')
    .insert({ user_id: userId })
    .select('user_id,stomach_profile_blob')
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function seedGutScore(supabase, args) {
  const user = await findUser(supabase, args);
  const score = args.score;
  const trendDelta = typeof args.trend === 'number' ? args.trend : inferredTrend(score);
  const previousScore = clampScore(score - trendDelta);
  const phase = phaseForScore(score);
  const previousPhase = phaseForScore(previousScore);
  const now = new Date();
  const previousDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const components = componentsForScore(score);
  const drivers = driversForScore(score);
  const baselineScore = clampScore(Math.round((score + previousScore) / 2));

  await ensureProfileRow(supabase, user.id);

  const previousSnapshot = {
    user_id: user.id,
    score: previousScore,
    baseline_score: baselineScore,
    phase: previousPhase,
    confidence_level: 'medium',
    trend_delta_7d: 0,
    components,
    drivers,
    window_start: previousDate.toISOString(),
    window_end: previousDate.toISOString(),
    created_at: previousDate.toISOString(),
  };

  const currentSnapshot = {
    user_id: user.id,
    score,
    baseline_score: baselineScore,
    phase,
    confidence_level: 'medium',
    trend_delta_7d: trendDelta,
    components,
    drivers,
    window_start: previousDate.toISOString(),
    window_end: now.toISOString(),
    created_at: now.toISOString(),
  };

  const { error: snapshotError } = await supabase
    .from('gut_score_snapshots')
    .insert([previousSnapshot, currentSnapshot]);

  if (snapshotError) throw snapshotError;

  const event = {
    user_id: user.id,
    event_type: 'mock_seed',
    source_type: 'mock_seed',
    source_id: `gut-score-${score}-${Date.now()}`,
    score_before: previousScore,
    score_after: score,
    score_delta: trendDelta,
    phase_before: previousPhase,
    phase_after: phase,
    summary: `Mock Gut Score seeded at ${score}/100 for UI testing.`,
    drivers,
    created_at: now.toISOString(),
  };

  const { data: insertedEvent, error: eventError } = await supabase
    .from('gut_score_events')
    .insert(event)
    .select('*')
    .single();

  if (eventError) throw eventError;

  const { data: profileRow, error: profileError } = await supabase
    .from('user_profiles')
    .select('stomach_profile_blob')
    .eq('user_id', user.id)
    .single();

  if (profileError) throw profileError;

  const stomachProfileBlob = profileRow?.stomach_profile_blob ?? {};
  const metadata = stomachProfileBlob.metadata ?? {};
  const gutScore = {
    currentScore: score,
    baselineScore,
    phase,
    confidenceLevel: 'medium',
    trendDelta7d: trendDelta,
    trendDirection: trendDirection(trendDelta),
    components,
    drivers,
    history: [
      { score: previousScore, createdAt: previousDate.toISOString() },
      { score, createdAt: now.toISOString() },
    ],
    nextAction: drivers[0]?.detail ?? '',
    updatedAt: now.toISOString(),
    recentEvent: {
      id: insertedEvent.id,
      eventType: insertedEvent.event_type,
      scoreBefore: previousScore,
      scoreAfter: score,
      scoreDelta: trendDelta,
      phaseBefore: previousPhase,
      phaseAfter: phase,
      summary: insertedEvent.summary,
      drivers,
      createdAt: now.toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({
      stomach_profile_blob: {
        ...stomachProfileBlob,
        metadata: {
          ...metadata,
          confirmedMealCount: Math.max(Number(metadata.confirmedMealCount ?? 0), 3),
          profileConfidenceLevel: metadata.profileConfidenceLevel ?? 'medium',
          gutScore,
        },
      },
      updated_at: now.toISOString(),
    })
    .eq('user_id', user.id);

  if (updateError) throw updateError;

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    score,
    previousScore,
    trendDelta,
    phase,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = readEnv(envPath);

  if (!env.PROJECT_URL || !env.SERVICE_ROLE_KEY) {
    throw new Error('PROJECT_URL and SERVICE_ROLE_KEY are required in supabase/.env.local');
  }

  const supabase = createClient(env.PROJECT_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  if (args.listUsers) {
    await listUsers(supabase);
    return;
  }

  const result = await seedGutScore(supabase, args);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

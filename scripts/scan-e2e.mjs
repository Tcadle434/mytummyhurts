#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const rootDir = process.cwd();
const fixtures = {
  menu: [
    path.join(rootDir, 'assets/tests/sushi_den_menu_1.png'),
    path.join(rootDir, 'assets/tests/sushi_den_menu_2.png'),
  ],
  food: path.join(rootDir, 'assets/tests/pizza_meal.jpeg'),
};
const expectedConditions = ['IBS', 'GERD / Acid reflux'];
const expectedMenuItemCount = 61;
const evalFixtures = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'scripts/eval/fixtures.json'), 'utf8'),
);
const genericMenuPhrases = [
  'Lower personalized risk for your current profile',
  'Middle-ground option based on the menu description',
  'High gut-load cues for your profile',
  'Higher personalized risk based on your profile and ingredient patterns',
  'workable',
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function requiredEnv(name, fallbackName) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  assert.ok(value, `Missing ${name}${fallbackName ? ` or ${fallbackName}` : ''}. Add it to .env.local or supabase/.env.local.`);
  return value;
}

function assertFixtureExists(filePath) {
  assert.ok(fs.existsSync(filePath), `Missing scan E2E fixture: ${filePath}`);
  assert.ok(fs.statSync(filePath).size > 0, `Scan E2E fixture is empty: ${filePath}`);
}

function mimeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function dataUrlForFile(filePath) {
  return `data:${mimeForFile(filePath)};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /fetch failed|socket|ECONNRESET|ETIMEDOUT|UND_ERR_SOCKET|network/i.test(message);
      if (!retryable || attempt === attempts) {
        break;
      }
      await sleep(750 * attempt);
    }
  }

  throw new Error(`${label} failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function makeSupabaseClients() {
  loadEnvFile(path.join(rootDir, '.env.local'));
  loadEnvFile(path.join(rootDir, 'supabase/.env.local'));

  const supabaseUrl = requiredEnv('EXPO_PUBLIC_SUPABASE_URL', 'PROJECT_URL');
  const anonKey = requiredEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY');

  return {
    supabaseUrl,
    anonKey,
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    anon: createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  };
}

async function createE2EUser(admin, anon) {
  const stamp = Date.now();
  const email = `scan-e2e-${stamp}@example.com`;
  const password = `ScanE2E-${stamp}!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(created.error);
  const user = created.data.user;
  assert.ok(user?.id, 'Supabase did not return a test user id.');

  const userUpsert = await admin.from('users').upsert(
    {
      id: user.id,
      email,
      subscription_status: 'active',
      current_token_balance: 10,
      default_monthly_token_allowance: 40,
    },
    { onConflict: 'id' },
  );
  assert.ifError(userUpsert.error);

  const profileUpsert = await admin.from('user_profiles').upsert(
    {
      user_id: user.id,
      known_conditions: expectedConditions,
      known_ingredient_sensitivities: ['dairy', 'fried foods', 'spicy foods', 'garlic', 'onion', 'tomato'],
      common_symptoms: ['Bloating', 'Reflux / Heartburn'],
      symptom_frequency: 'A few times a week',
      symptom_severity_baseline: 'Moderate',
      meal_contexts: ['Restaurants', 'Takeout'],
    },
    { onConflict: 'user_id' },
  );
  assert.ifError(profileUpsert.error);

  const signedIn = await anon.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);
  assert.ok(signedIn.data.session?.access_token, 'Supabase did not return an access token for the test user.');

  return {
    userId: user.id,
    email,
    accessToken: signedIn.data.session.access_token,
  };
}

async function cleanupE2EUser(admin, userId, storagePaths) {
  if (storagePaths.length) {
    const removed = await admin.storage.from('meal-images').remove(storagePaths);
    if (removed.error) {
      console.warn(`[scan-e2e] storage cleanup warning: ${removed.error.message}`);
    }
  }

  if (userId) {
    const publicDelete = await admin.from('users').delete().eq('id', userId);
    if (publicDelete.error) {
      console.warn(`[scan-e2e] public user cleanup warning: ${publicDelete.error.message}`);
    }

    const authDelete = await admin.auth.admin.deleteUser(userId);
    if (authDelete.error) {
      console.warn(`[scan-e2e] auth user cleanup warning: ${authDelete.error.message}`);
    }
  }
}

async function uploadFixture(admin, userId, filePath, label) {
  const storagePath = `${userId}/scan-e2e-${Date.now()}-${label}${path.extname(filePath).toLowerCase()}`;
  await retry(`upload ${label}`, async () => {
    const uploaded = await admin.storage.from('meal-images').upload(storagePath, fs.readFileSync(filePath), {
      contentType: mimeForFile(filePath),
      upsert: true,
    });
    assert.ifError(uploaded.error);
  });
  return storagePath;
}

async function invokeFunction({ supabaseUrl, anonKey, accessToken, functionName, body }) {
  return retry(`invoke ${functionName}`, async () => {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`${functionName} returned non-JSON ${response.status}: ${text.slice(0, 500)}`);
    }

    if (!response.ok) {
      throw new Error(`${functionName} returned ${response.status}: ${text.slice(0, 1000)}`);
    }

    return json;
  }, 2);
}

async function getScanDetail(context, scanId) {
  const response = await invokeFunction({
    ...context,
    functionName: 'scan-get',
    body: { scanId },
  });
  assert.equal(response.ok, true, 'scan-get should return ok: true');
  assert.ok(response.scan, 'scan-get should return scan detail.');
  return response.scan;
}

async function getAuditLogs(admin, requestId) {
  const { data, error } = await admin
    .from('scan_ai_audit_logs')
    .select(
      [
        'stage',
        'status',
        'model',
        'input_refs',
        'raw_response_text',
        'raw_response_json',
        'parsed_response_json',
        'normalized_response_json',
        'error_code',
        'error_message',
        'latency_ms',
        'openai_response_id',
        'input_tokens',
        'cached_input_tokens',
        'output_tokens',
        'reasoning_tokens',
        'total_tokens',
        'estimated_cost_usd_micros',
        'pricing_snapshot',
        'billable',
      ].join(','),
    )
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  assert.ifError(error);
  return data ?? [];
}

function assertRiskScore(score, label) {
  assert.equal(typeof score, 'number', `${label} score should be a number.`);
  assert.ok(score >= 0 && score <= 100, `${label} score should be between 0 and 100, got ${score}.`);
}

function assertRiskLevel(level, label) {
  assert.ok(['low', 'medium', 'high'].includes(level), `${label} risk level should be low, medium, or high.`);
}

function assertPositiveNumber(value, label) {
  assert.equal(typeof value, 'number', `${label} should be a number.`);
  assert.ok(Number.isFinite(value) && value > 0, `${label} should be greater than 0, got ${value}.`);
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} should be a string.`);
  assert.ok(value.trim().length > 0, `${label} should not be empty.`);
}

function assertInlineImageRefs(auditRow, expectedCount) {
  assert.ok(Array.isArray(auditRow.input_refs), `${auditRow.stage} should store input_refs.`);
  assert.equal(auditRow.input_refs.length, expectedCount, `${auditRow.stage} should store ${expectedCount} image input refs.`);
  for (const inputRef of auditRow.input_refs) {
    assert.equal(inputRef.imageRef, 'inline_data_url', `${auditRow.stage} should use inline image data, not signed storage URLs.`);
  }
}

function assertRawAndParsedAudit(auditRow, label) {
  assert.equal(auditRow.status, 'completed', `${label} audit status should be completed.`);
  assertNonEmptyString(auditRow.raw_response_text, `${label} raw_response_text`);
  assert.ok(auditRow.raw_response_text.length > 50, `${label} raw_response_text should contain a real model response.`);
  assert.ok(auditRow.raw_response_json, `${label} should store raw_response_json.`);
  assert.ok(auditRow.parsed_response_json, `${label} should store parsed_response_json.`);
  assert.equal(auditRow.error_code, null, `${label} should not have an audit error code.`);
  assertAuditUsageAndCost(auditRow, label);
}

function assertNormalizedAudit(auditRow, label) {
  assertRawAndParsedAudit(auditRow, label);
  assert.ok(auditRow.normalized_response_json, `${label} should store normalized_response_json.`);
}

function assertAuditUsageAndCost(auditRow, label) {
  assertNonEmptyString(auditRow.model, `${label} model`);
  assert.equal(typeof auditRow.billable, 'boolean', `${label} billable should be boolean.`);
  assert.equal(typeof auditRow.input_tokens, 'number', `${label} input_tokens should be stored.`);
  assert.equal(typeof auditRow.cached_input_tokens, 'number', `${label} cached_input_tokens should be stored.`);
  assert.equal(typeof auditRow.output_tokens, 'number', `${label} output_tokens should be stored.`);
  assert.equal(typeof auditRow.reasoning_tokens, 'number', `${label} reasoning_tokens should be stored.`);
  assert.equal(typeof auditRow.total_tokens, 'number', `${label} total_tokens should be stored.`);
  assert.ok(auditRow.input_tokens > 0, `${label} input_tokens should be positive.`);
  assert.ok(auditRow.cached_input_tokens >= 0, `${label} cached_input_tokens should be non-negative.`);
  assert.ok(auditRow.output_tokens > 0, `${label} output_tokens should be positive.`);
  assert.ok(auditRow.reasoning_tokens >= 0, `${label} reasoning_tokens should be non-negative.`);
  assert.ok(auditRow.total_tokens >= auditRow.input_tokens, `${label} total_tokens should include input tokens.`);
  assert.ok(auditRow.pricing_snapshot, `${label} should store pricing_snapshot.`);
  assert.equal(auditRow.pricing_snapshot.pricingSchemaVersion, 'openai_pricing_v1', `${label} should store pricing schema version.`);
  assert.equal(auditRow.pricing_snapshot.provider, 'openai', `${label} pricing provider should be openai.`);
  assert.equal(auditRow.pricing_snapshot.model, auditRow.model, `${label} pricing snapshot should preserve model.`);
  assert.equal(typeof auditRow.estimated_cost_usd_micros, 'number', `${label} should store estimated cost in USD micros.`);
  assert.ok(auditRow.estimated_cost_usd_micros >= 0, `${label} estimated cost should be non-negative.`);
  if (auditRow.billable) {
    assertNonEmptyString(auditRow.openai_response_id, `${label} openai_response_id`);
    assert.ok(auditRow.estimated_cost_usd_micros > 0, `${label} billable rows should have positive estimated cost.`);
  }
}

function assertScanInputRows(rows, expectedCount, expectedRole) {
  assert.equal(rows.length, expectedCount, `Expected ${expectedCount} scan input rows.`);
  rows.forEach((row, index) => {
    assert.equal(row.input_kind, 'image', `scan input ${index} should be an image.`);
    assert.equal(row.image_role, expectedRole, `scan input ${index} should use image_role ${expectedRole}.`);
    assertNonEmptyString(row.storage_path, `scan input ${index} storage_path`);
    assertPositiveNumber(Number(row.byte_size), `scan input ${index} byte_size`);
    assert.equal(row.metadata?.inlineImageProvided, true, `scan input ${index} should record inline image metadata.`);
    assert.equal(row.metadata?.storagePathProvided, true, `scan input ${index} should record storage path metadata.`);
  });
}

async function getScanInputs(admin, scanId) {
  const { data, error } = await admin
    .from('scan_inputs')
    .select('input_kind,image_role,storage_path,page_index,byte_size,metadata')
    .eq('scan_id', scanId)
    .order('page_index', { ascending: true });
  assert.ifError(error);
  return data ?? [];
}

function uiMenuItemFromResult(item) {
  return {
    id: item.id,
    name: item.name,
    score: item.riskScore,
    level: item.riskLevel,
    reason: item.whyThisScore,
    insight: item.whyThisScore,
    triggers: item.ingredientRisks.length ? item.ingredientRisks.slice(0, 3).map((ingredient) => ingredient.canonicalName) : undefined,
    scoreContributors: item.scoreContributors,
    scoringConfidence: item.scoringConfidence,
    saferSwap: item.gutRecommendation,
  };
}

function uiIngredientFromResult(ingredient) {
  return {
    name: ingredient.canonicalName,
    level: ingredient.riskLevel,
    note: ingredient.reason || (ingredient.evidence === 'inferred' ? 'Likely inferred from scan' : undefined),
  };
}

function assertMenuItem(item, expectedTier) {
  if (expectedTier) {
    assert.equal(item.tier, expectedTier, `${item.name} should be in tier ${expectedTier}.`);
  }
  assertNonEmptyString(item.id, 'menu item id');
  assertNonEmptyString(item.name, 'menu item name');
  assertRiskScore(item.riskScore, `${item.name} risk`);
  assertRiskLevel(item.riskLevel, `${item.name} risk`);
  assertRiskLevel(item.scoringConfidence, `${item.name} scoring confidence`);
  assertNonEmptyString(item.whyThisScore, `${item.name} whyThisScore`);
  assert.ok(!genericMenuPhrases.some((phrase) => item.whyThisScore.includes(phrase)), `${item.name} uses generic menu copy: ${item.whyThisScore}`);
  assert.ok(Array.isArray(item.scoreContributors), `${item.name} scoreContributors should be an array.`);
  assert.ok(item.scoreContributors.length > 0, `${item.name} should persist score contributors.`);
  assert.ok(
    item.scoreContributors.some((driver) => driver.key !== 'base_menu_risk'),
    `${item.name} should have at least one dish-specific score contributor.`,
  );
  item.scoreContributors.forEach((driver, index) => {
    assertNonEmptyString(driver.key, `${item.name} score contributor ${index} key`);
    assertNonEmptyString(driver.label, `${item.name} score contributor ${index} label`);
    assert.equal(typeof driver.points, 'number', `${item.name} score contributor ${index} points should be numeric.`);
    assertNonEmptyString(driver.evidence, `${item.name} score contributor ${index} evidence`);
    assertNonEmptyString(driver.source, `${item.name} score contributor ${index} source`);
    assertNonEmptyString(driver.reason, `${item.name} score contributor ${index} reason`);
  });
  assert.ok(Array.isArray(item.ingredientRisks), `${item.name} ingredientRisks should be an array.`);
  assert.ok(item.ingredientRisks.length > 0, `${item.name} should expose ingredient callouts for the dropdown UI.`);
  item.ingredientRisks.forEach((ingredient, index) => {
    assertNonEmptyString(ingredient.canonicalName, `${item.name} ingredient ${index} canonicalName`);
    assertNonEmptyString(ingredient.reason, `${item.name} ingredient ${index} reason`);
    assertRiskScore(ingredient.riskScore, `${item.name} ingredient ${index}`);
    assertRiskLevel(ingredient.riskLevel, `${item.name} ingredient ${index}`);
  });

  const uiItem = uiMenuItemFromResult(item);
  assertNonEmptyString(uiItem.id, `${item.name} UI id`);
  assertNonEmptyString(uiItem.name, `${item.name} UI name`);
  assertRiskScore(uiItem.score, `${item.name} UI score`);
  assertRiskLevel(uiItem.level, `${item.name} UI level`);
  assertNonEmptyString(uiItem.reason, `${item.name} UI reason`);
  assert.equal(uiItem.insight, uiItem.reason, `${item.name} UI insight should map to whyThisScore.`);
  assert.deepEqual(uiItem.scoreContributors, item.scoreContributors, `${item.name} UI should receive score contributors.`);
}

function assertMenuScan(scan, auditRows, inputRows) {
  assert.equal(scan.scanCategory, 'menu');
  assert.equal(scan.analysisStatus, 'completed');
  assert.ok(scan.menuResult, 'Menu scan detail should include menuResult.');
  assert.equal(scan.menuResult.inputPageCount, fixtures.menu.length, 'Menu result should preserve page count.');
  assertNonEmptyString(scan.menuResult.summary, 'menu summary');
  assert.ok(Array.isArray(scan.menuResult.items), 'Menu result should include the comprehensive ranked items array.');
  assert.ok(scan.menuResult.items.length >= 9, `Expected at least 9 ranked menu items, got ${scan.menuResult.items.length}.`);
  assert.ok(scan.menuResult.items.length <= 100, `Expected at most 100 ranked menu items, got ${scan.menuResult.items.length}.`);
  assert.equal(
    scan.menuResult.items.length,
    expectedMenuItemCount,
    `Expected all ${expectedMenuItemCount} menu items from the Sushi Den fixture, got ${scan.menuResult.items.length}.`,
  );

  for (let index = 1; index < scan.menuResult.items.length; index += 1) {
    assert.ok(
      scan.menuResult.items[index - 1].riskScore <= scan.menuResult.items[index].riskScore,
      `Menu items should be sorted best-to-worst, got scores ${scan.menuResult.items.map((item) => item.riskScore).join(', ')}.`,
    );
  }

  // EVAL (labeled expectations, scripts/eval/fixtures.json). False-lows are
  // hard failures: known-risky dishes must never render as low risk for the
  // harness's IBS + GERD profile.
  const menuEval = evalFixtures.menu;
  const falseLowPatterns = menuEval.falseLowNamePatterns.map((pattern) => new RegExp(pattern, 'i'));
  const riskyMatches = scan.menuResult.items.filter((item) =>
    falseLowPatterns.some((pattern) => pattern.test(item.name)),
  );
  assert.ok(
    riskyMatches.length > 0,
    'EVAL: expected at least one known-risky dish (tempura/katsu/fried/spicy) in the fixture menu.',
  );
  const falseLows = riskyMatches.filter((item) => item.riskScore < menuEval.falseLowMinScore);
  assert.equal(
    falseLows.length,
    0,
    `EVAL HARD FAILURE (false reassurance): risky dishes scored as low risk for an IBS+GERD profile: ${falseLows
      .map((item) => `${item.name}=${item.riskScore}`)
      .join(', ')}`,
  );
  const scores = scan.menuResult.items.map((item) => item.riskScore);
  const spread = Math.max(...scores) - Math.min(...scores);
  assert.ok(
    spread >= menuEval.minScoreSpread,
    `EVAL: menu scoring should spread across the scale (>= ${menuEval.minScoreSpread} points), got ${spread}.`,
  );

  for (const item of scan.menuResult.items) {
    const expectedTier = item.riskScore >= 67 ? 'try_to_avoid' : item.riskScore >= 34 ? 'eat_with_caution' : 'best_for_you';
    assertMenuItem(item, expectedTier);
  }

  const allItems = scan.menuResult.items;
  const uniqueScores = new Set(allItems.map((item) => item.riskScore));
  const lowRiskItems = allItems.filter((item) => item.riskLevel === 'low');
  const lowRiskUniqueScores = new Set(lowRiskItems.map((item) => item.riskScore));
  assert.ok(
    uniqueScores.size >= Math.min(10, Math.max(5, Math.floor(allItems.length / 6))),
    `Menu scoring should not collapse many items to one score; got ${uniqueScores.size} unique scores across ${allItems.length} items.`,
  );
  if (lowRiskItems.length >= 10) {
    assert.ok(
      lowRiskUniqueScores.size >= 4,
      `Low-risk menu items should still vary; got scores ${[...lowRiskUniqueScores].join(', ')}.`,
    );
  }
  assert.equal(
    scan.menuResult.bestForYou.length + scan.menuResult.eatWithCaution.length + scan.menuResult.tryToAvoid.length,
    allItems.length,
    'Risk-band arrays should partition the comprehensive ranked menu items.',
  );
  assert.equal(new Set(allItems.map((item) => item.whyThisScore)).size, allItems.length, 'Menu item one-liners should be unique.');
  assert.ok(scan.menuResult.tryToAvoid.length > 0, 'Try-to-avoid should include high-risk options.');
  assert.ok(Math.max(...scan.menuResult.tryToAvoid.map((item) => item.riskScore)) >= 67, 'Try-to-avoid should include high-risk scores.');

  const extractionAudit = auditRows.find((row) => row.stage === 'menu_image_extraction');
  assert.ok(extractionAudit, 'Menu scan should store a menu_image_extraction audit row.');
  assertInlineImageRefs(extractionAudit, fixtures.menu.length);
  assertNormalizedAudit(extractionAudit, 'menu_image_extraction');
  if (fixtures.menu.length > 1) {
    assert.equal(extractionAudit.billable, false, 'Synthetic combined menu audit should not be billable.');
    const pageAudits = auditRows.filter((row) => row.stage === 'menu_image_extraction_page');
    assert.equal(pageAudits.length, fixtures.menu.length, 'Menu scan should store one billable extraction audit per page.');
    const pageCost = pageAudits.reduce((total, row) => total + Number(row.estimated_cost_usd_micros ?? 0), 0);
    const pageTokens = pageAudits.reduce((total, row) => total + Number(row.total_tokens ?? 0), 0);
    for (const pageAudit of pageAudits) {
      assertRawAndParsedAudit(pageAudit, `menu_image_extraction_page ${pageAudit.input_refs?.[0]?.pageIndex ?? ''}`);
      assert.equal(pageAudit.billable, true, 'Page-level menu extraction audits should be billable.');
    }
    assert.equal(extractionAudit.estimated_cost_usd_micros, pageCost, 'Synthetic menu audit should aggregate page costs.');
    assert.equal(extractionAudit.total_tokens, pageTokens, 'Synthetic menu audit should aggregate page tokens.');
  }
  const parsedMenuItems = extractionAudit.parsed_response_json?.items ?? [];
  const normalizedMenuItems = extractionAudit.normalized_response_json?.items ?? [];
  assert.ok(parsedMenuItems.length > 0, 'Menu extraction audit should include parsed menu items.');
  assert.ok(normalizedMenuItems.length > 0, 'Menu extraction audit should include normalized menu items.');
  parsedMenuItems.forEach((item, index) => {
    assert.ok(item.baseFoodCategory?.key, `parsed menu item ${index} should include a baseFoodCategory.`);
    assert.ok(Array.isArray(item.riskModifiers), `parsed menu item ${index} should include a riskModifiers array.`);
  });
  normalizedMenuItems.forEach((item, index) => {
    assert.ok(item.baseFoodCategory?.key, `normalized menu item ${index} should include a baseFoodCategory.`);
    assert.ok(Array.isArray(item.riskModifiers), `normalized menu item ${index} should include a riskModifiers array.`);
  });
  assertScanInputRows(inputRows, fixtures.menu.length, 'menu_page');
}

function assertFoodScan(scan, auditRows, inputRows) {
  assert.equal(scan.scanCategory, 'food');
  assert.equal(scan.analysisStatus, 'completed');
  assert.equal(scan.menuResult, undefined, 'Food scan should not include menuResult.');
  assertNonEmptyString(scan.dishName, 'food dishName');
  assert.match(scan.dishName.toLowerCase(), /pizza|slice|flatbread|cheese/, 'Food fixture should be recognized as pizza-like.');
  assertRiskScore(scan.overallRiskScore, 'food overall risk');
  assertRiskLevel(scan.overallRiskLevel, 'food overall risk');
  assert.ok(
    scan.overallRiskScore >= 55 && scan.overallRiskScore <= 80,
    `Food pizza fixture should calibrate as medium-high risk, got ${scan.overallRiskScore}.`,
  );

  // EVAL: the pizza must flag its known trigger groups for this profile, and
  // must never read as low risk (false reassurance = hard failure).
  const foodEval = evalFixtures.food;
  assert.ok(
    scan.overallRiskScore >= foodEval.falseLowMinScore,
    `EVAL HARD FAILURE (false reassurance): pizza scored ${scan.overallRiskScore} (< ${foodEval.falseLowMinScore}) for an IBS+GERD profile.`,
  );
  const flaggedNames = [
    ...(scan.ingredientRisks ?? []).map((ingredient) => `${ingredient.canonicalName} ${ingredient.rawName ?? ''}`),
    ...(scan.scoreContributors ?? []).map((driver) => `${driver.label} ${driver.reason}`),
  ]
    .join(' ')
    .toLowerCase();
  for (const group of foodEval.mustFlagAnyOf) {
    assert.ok(
      group.some((trigger) => flaggedNames.includes(trigger)),
      `EVAL: expected the pizza result to flag one of [${group.join(', ')}] in ingredients or score drivers.`,
    );
  }
  assertNonEmptyString(scan.pipTake ?? scan.interpretation, "food Pip's take");
  assert.ok(scan.baseFoodCategory?.key, 'Food scan should persist a scan-level baseFoodCategory.');
  assert.ok(Array.isArray(scan.riskModifiers), 'Food scan should persist scan-level riskModifiers.');
  assert.ok(scan.riskModifiers.length > 0, 'Food scan should include risk modifiers.');
  assert.ok(Array.isArray(scan.scoreContributors), 'Food scan should persist scan-level scoreContributors.');
  assert.ok(
    scan.scoreContributors.some((driver) => driver.key !== 'base_menu_risk'),
    'Food scan should include food-specific score contributors.',
  );
  assertNonEmptyString(scan.gutRecommendation, 'food gutRecommendation');
  assert.ok(Array.isArray(scan.conditionRisks), 'Food conditionRisks should be an array.');
  assert.equal(scan.conditionRisks.length, expectedConditions.length, 'Food conditionRisks should include only the listed user conditions.');
  assert.deepEqual(
    new Set(scan.conditionRisks.map((risk) => risk.conditionName)),
    new Set(expectedConditions),
    'Food conditionRisks should match the E2E user profile conditions.',
  );
  scan.conditionRisks.forEach((risk) => {
    assertRiskScore(risk.riskScore, `${risk.conditionName} condition`);
    assertRiskLevel(risk.riskLevel, `${risk.conditionName} condition`);
    assertNonEmptyString(risk.reason, `${risk.conditionName} condition reason`);
  });

  assert.ok(scan.ingredientRisks.length >= 2, 'Food scan should return ingredient risk rows.');
  const ingredientNames = scan.ingredientRisks.map((ingredient) => ingredient.canonicalName.toLowerCase());
  assert.ok(
    ingredientNames.some((name) => /cheese|tomato|sauce|crust|dough|wheat|pepperoni|pizza/.test(name)),
    `Food scan should include pizza-relevant ingredients, got: ${ingredientNames.join(', ')}`,
  );
  scan.ingredientRisks.forEach((ingredient, index) => {
    assertNonEmptyString(ingredient.canonicalName, `food ingredient ${index} canonicalName`);
    assertNonEmptyString(ingredient.reason, `food ingredient ${index} reason`);
    assertRiskScore(ingredient.riskScore, `food ingredient ${index}`);
    assertRiskLevel(ingredient.riskLevel, `food ingredient ${index}`);
    const uiIngredient = uiIngredientFromResult(ingredient);
    assertNonEmptyString(uiIngredient.name, `food UI ingredient ${index} name`);
    assertRiskLevel(uiIngredient.level, `food UI ingredient ${index} level`);
    assertNonEmptyString(uiIngredient.note, `food UI ingredient ${index} note`);
  });

  const extractionAudit = auditRows.find((row) => row.stage === 'food_image_extraction');
  const normalizationAudit = auditRows.find((row) => row.stage === 'normalization');
  assert.ok(extractionAudit, 'Food scan should store a food_image_extraction audit row.');
  assert.ok(normalizationAudit, 'Food scan should store a normalization audit row.');
  assertInlineImageRefs(extractionAudit, 1);
  assertInlineImageRefs(normalizationAudit, 1);
  assertRawAndParsedAudit(extractionAudit, 'food_image_extraction');
  assertNormalizedAudit(normalizationAudit, 'normalization');
  assert.ok(extractionAudit.parsed_response_json?.baseFoodCategory?.key, 'Food extraction audit should include parsed baseFoodCategory.');
  assert.ok(Array.isArray(extractionAudit.parsed_response_json?.riskModifiers), 'Food extraction audit should include parsed riskModifiers.');
  assert.ok(normalizationAudit.normalized_response_json?.baseFoodCategory?.key, 'Food normalization audit should include normalized baseFoodCategory.');
  assert.ok(Array.isArray(normalizationAudit.normalized_response_json?.riskModifiers), 'Food normalization audit should include normalized riskModifiers.');
  assertScanInputRows(inputRows, 1, 'meal');
}

async function runMenuE2E(context, userId, storagePaths) {
  const requestId = `scan-e2e-menu-${Date.now()}`;
  const uploadedPaths = [];
  for (let index = 0; index < fixtures.menu.length; index += 1) {
    const storagePath = await uploadFixture(context.admin, userId, fixtures.menu[index], `menu-${index}`);
    uploadedPaths.push(storagePath);
    storagePaths.push(storagePath);
  }

  const analyzeResponse = await invokeFunction({
    ...context,
    functionName: 'scan-analyze-image',
    body: {
      requestId,
      imagePaths: uploadedPaths,
      imageDataUrls: fixtures.menu.map(dataUrlForFile),
      sourceType: 'upload',
      scanCategory: 'menu',
      localDate: '2026-05-21',
      timezone: 'America/Denver',
    },
  });
  assert.ok(analyzeResponse.scanId, 'Menu analyze response should include scanId.');

  const [scan, auditRows, inputRows] = await Promise.all([
    getScanDetail(context, analyzeResponse.scanId),
    getAuditLogs(context.admin, requestId),
    getScanInputs(context.admin, analyzeResponse.scanId),
  ]);
  assertMenuScan(scan, auditRows, inputRows);

  return {
    scanId: analyzeResponse.scanId,
    title: scan.menuResult.menuTitle,
    itemCount: scan.menuResult.items.length,
    items: scan.menuResult.items.slice(0, 12).map((item) => ({ rank: item.displayOrder + 1, name: item.name, score: item.riskScore })),
    riskBandCounts: {
      bestForYou: scan.menuResult.bestForYou.length,
      eatWithCaution: scan.menuResult.eatWithCaution.length,
      tryToAvoid: scan.menuResult.tryToAvoid.length,
    },
    auditStages: auditRows.map((row) => row.stage),
  };
}

async function runFoodE2E(context, userId, storagePaths) {
  const requestId = `scan-e2e-food-${Date.now()}`;
  const storagePath = await uploadFixture(context.admin, userId, fixtures.food, 'pizza-food');
  storagePaths.push(storagePath);

  const analyzeResponse = await invokeFunction({
    ...context,
    functionName: 'scan-analyze-image',
    body: {
      requestId,
      imagePath: storagePath,
      imageDataUrl: dataUrlForFile(fixtures.food),
      sourceType: 'upload',
      scanCategory: 'food',
      localDate: '2026-05-21',
      timezone: 'America/Denver',
    },
  });
  assert.ok(analyzeResponse.scanId, 'Food analyze response should include scanId.');

  const [scan, auditRows, inputRows] = await Promise.all([
    getScanDetail(context, analyzeResponse.scanId),
    getAuditLogs(context.admin, requestId),
    getScanInputs(context.admin, analyzeResponse.scanId),
  ]);
  assertFoodScan(scan, auditRows, inputRows);

  return {
    scanId: analyzeResponse.scanId,
    dishName: scan.dishName,
    overallRiskScore: scan.overallRiskScore,
    conditionRisks: scan.conditionRisks.map((risk) => ({ conditionName: risk.conditionName, score: risk.riskScore })),
    ingredientRisks: scan.ingredientRisks.slice(0, 5).map((ingredient) => ({ name: ingredient.canonicalName, score: ingredient.riskScore })),
    auditStages: auditRows.map((row) => row.stage),
  };
}

async function main() {
  [...fixtures.menu, fixtures.food].forEach(assertFixtureExists);

  const clients = makeSupabaseClients();
  const context = {
    supabaseUrl: clients.supabaseUrl,
    anonKey: clients.anonKey,
    admin: clients.admin,
  };
  const storagePaths = [];
  let userId = null;
  const keepArtifacts = process.env.SCAN_E2E_KEEP_ARTIFACTS === '1';

  try {
    const user = await createE2EUser(clients.admin, clients.anon);
    userId = user.userId;
    context.accessToken = user.accessToken;

    const menu = await runMenuE2E(context, userId, storagePaths);
    const food = await runFoodE2E(context, userId, storagePaths);

    console.log(JSON.stringify({ ok: true, menu, food }, null, 2));
  } finally {
    if (keepArtifacts) {
      console.warn(`[scan-e2e] keeping test artifacts for debugging userId=${userId ?? 'unknown'} storagePaths=${storagePaths.join(',')}`);
    } else {
      await cleanupE2EUser(clients.admin, userId, storagePaths);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

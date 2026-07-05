import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccountModule } from '../src/account/account.module';
import { AccountService } from '../src/account/account.service';
import { CommonModule } from '../src/common/common.module';
import { DailyReportModule } from '../src/daily-report/daily-report.module';
import { DailyReportService } from '../src/daily-report/daily-report.service';
import { DatabaseModule } from '../src/database/database.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ScanCrudService } from '../src/scan/scan-crud.service';
import { ScanModule } from '../src/scan/scan.module';
import { StorageModule } from '../src/storage/storage.module';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const U = '66666666-6666-6666-6666-666666666666';
const FOOD_SCAN = '77777777-7777-7777-7777-777777777777';
const MENU_SCAN = '77777777-7777-7777-7777-777777777778';
const MENU_ITEM = '77777777-7777-7777-7777-777777777779';
const PRIOR_BREAD_SCAN = '77777777-7777-7777-7777-777777777780';
const PRIOR_PASTA_SCAN = '77777777-7777-7777-7777-777777777781';

let daily: DailyReportService;
let notifications: NotificationsService;
let account: AccountService;
let crud: ScanCrudService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      CommonModule,
      StorageModule,
      ScanModule,
      DailyReportModule,
      NotificationsModule,
      AccountModule,
    ],
  }).compile();
  daily = moduleRef.get(DailyReportService);
  notifications = moduleRef.get(NotificationsService);
  account = moduleRef.get(AccountService);
  crud = moduleRef.get(ScanCrudService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'endpoints@test.dev', 'active', 40)`;
  await admin`insert into public.user_profiles (user_id) values (${U}) on conflict do nothing`;
  // a completed scan to read/delete
  await admin`insert into public.scans (
                id, user_id, request_id, source_type, scan_category, analysis_status,
                token_transaction_id, title, overall_risk_score, overall_risk_level,
                consumption_status, local_date, timezone, created_at
              )
              values (
                ${FOOD_SCAN}, ${U}, 'req-food-1', 'manual_text', 'food',
                'completed', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test dish',
                42, 'medium', 'unknown', '2026-06-22', 'America/Denver',
                '2026-06-22T12:00:00Z'
              )`;
  await admin`insert into public.scan_inputs (scan_id, user_id, input_kind, storage_path, page_index)
              values (${FOOD_SCAN}, ${U}, 'image', ${`${U}/food.jpg`}, 0)`;
  await admin`insert into public.scan_ingredient_risks (
                scan_id, user_id, raw_name, canonical_name, risk_score, risk_level,
                evidence, confidence, reason, display_order
              )
              values
                (${FOOD_SCAN}, ${U}, 'bread', 'bread', 42, 'medium', 'visible', 'high', 'Wheat bread.', 0),
                (${FOOD_SCAN}, ${U}, 'turkey', 'turkey', 14, 'low', 'visible', 'high', 'Lean protein.', 1),
                (${FOOD_SCAN}, ${U}, 'rye', 'rye', 38, 'medium', 'visible', 'high', 'Wheat-family grain.', 2)`;
  await admin`insert into public.scans (
                id, user_id, request_id, source_type, scan_category, analysis_status,
                title, overall_risk_score, overall_risk_level, consumption_status,
                local_date, timezone, created_at
              )
              values
                (${PRIOR_BREAD_SCAN}, ${U}, 'req-bread-prior', 'manual_text', 'food',
                 'completed', 'prior bread', 44, 'medium', 'consumed',
                 '2026-06-20', 'America/Denver', '2026-06-20T12:00:00Z'),
                (${PRIOR_PASTA_SCAN}, ${U}, 'req-pasta-prior', 'manual_text', 'food',
                 'completed', 'prior pasta', 48, 'medium', 'consumed',
                 '2026-06-21', 'America/Denver', '2026-06-21T12:00:00Z')`;
  await admin`insert into public.scan_ingredient_risks (
                scan_id, user_id, raw_name, canonical_name, risk_score, risk_level,
                evidence, confidence, reason, display_order
              )
              values
                (${PRIOR_BREAD_SCAN}, ${U}, 'bread', 'bread', 42, 'medium', 'visible', 'high', 'Wheat bread.', 0),
                (${PRIOR_PASTA_SCAN}, ${U}, 'pasta', 'pasta', 46, 'medium', 'visible', 'high', 'Wheat pasta.', 0)`;
  await admin`insert into public.ingredient_insights (
                user_id, ingredient_name, trigger_score, safe_score, combined_risk_score,
                confidence_level, pattern_strength, linked_conditions,
                supporting_evidence_count, positive_evidence_count, negative_evidence_count,
                last_seen_at, last_outcome_at, source_breakdown
              )
              values
                (${U}, 'bread', 24, 2, 72, 'high', 'strong', '["IBS"]'::jsonb,
                 3, 0, 3, '2026-06-20T12:00:00Z', '2026-06-20T12:00:00Z',
                 '{"personal":true,"positiveEvidenceCount":0,"negativeEvidenceCount":3}'::jsonb),
                (${U}, 'pasta', 18, 2, 66, 'medium', 'moderate', '["IBS"]'::jsonb,
                 2, 0, 2, '2026-06-21T12:00:00Z', '2026-06-21T12:00:00Z',
                 '{"personal":true,"positiveEvidenceCount":0,"negativeEvidenceCount":2}'::jsonb)`;
  await admin`insert into public.ingredient_taxonomy_classifications (
                normalized_ingredient_name, display_name, primary_food_family_key,
                digestive_pattern_keys, confidence, reason, taxonomy_version, source
              )
              values
                ('bread', 'bread', 'wheat_grains', '["wheat_fructan_gluten"]'::jsonb,
                 'high', 'test wheat family', 'taxonomy_v1', 'deterministic'),
                ('pasta', 'pasta', 'wheat_grains', '["wheat_fructan_gluten"]'::jsonb,
                 'high', 'test wheat family', 'taxonomy_v1', 'deterministic'),
                ('rye', 'rye', 'wheat_grains', '["wheat_fructan_gluten"]'::jsonb,
                 'high', 'test wheat family', 'taxonomy_v1', 'deterministic')
              on conflict (normalized_ingredient_name) do update set
                display_name = excluded.display_name,
                primary_food_family_key = excluded.primary_food_family_key,
                digestive_pattern_keys = excluded.digestive_pattern_keys,
                confidence = excluded.confidence,
                reason = excluded.reason,
                taxonomy_version = excluded.taxonomy_version,
                source = excluded.source`;
  await admin`insert into public.scans (
                id, user_id, request_id, source_type, scan_category, analysis_status,
                token_transaction_id, title, summary, overall_risk_score, overall_risk_level,
                consumption_status, local_date, timezone, created_at
              )
              values (
                ${MENU_SCAN}, ${U}, 'req-menu-1', 'upload', 'menu',
                'completed', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'test menu',
                'menu summary', 35, 'low', 'unknown', '2026-06-23',
                'America/Denver', '2026-06-23T12:00:00Z'
              )`;
  await admin`insert into public.scan_inputs (scan_id, user_id, input_kind, storage_path, page_index)
              values (${MENU_SCAN}, ${U}, 'image', ${`${U}/menu.jpg`}, 0)`;
  await admin`insert into public.menu_items (
                id, scan_id, user_id, source_item_id, tier, tier_rank, display_order,
                name, risk_score, risk_level, confidence, scoring_confidence,
                score_contributors, why_this_score
              )
              values (
                ${MENU_ITEM}, ${MENU_SCAN}, ${U}, 'item-1', 'best_for_you', 1, 0,
                'Grilled salmon', 22, 'low', 'high', 'high', '[]'::jsonb,
                'Lean protein with simple prep.'
              )`;
  await admin`insert into public.scan_ingredient_risks (
                scan_id, user_id, menu_item_id, menu_item_source_id, raw_name,
                canonical_name, risk_score, risk_level, evidence, confidence,
                reason, display_order
              )
              values (
                ${MENU_SCAN}, ${U}, ${MENU_ITEM}, 'item-1', 'salmon',
                'salmon', 12, 'low', 'visible', 'high', 'Gentle protein.', 0
              )`;
  await admin`insert into public.scan_diet_evaluations (
                scan_id, user_id, menu_item_id, menu_item_source_id, diet_key,
                diet_label, status, confidence, reason, supporting_factors,
                conflicts, missing_info, score_adjustment, rubric_version, display_order
              )
              values (
                ${MENU_SCAN}, ${U}, ${MENU_ITEM}, 'item-1', 'low_fodmap',
                'Low FODMAP', 'fits', 'medium', 'No high FODMAP cues.',
                '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, 'test', 0
              )`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('daily-report-upsert', () => {
  it('upserts a report with a symptom-based daily score', async () => {
    const r = await daily.upsert(U, { localDate: '2026-06-22', gutSeverity: 2, symptomTags: ['bloating'] });
    expect(r.ok).toBe(true);
    expect(r.report.localDate).toBe('2026-06-22');
    expect(r.report.dailyScore).toBe(74); // 90 - 2*8
    // upsert again (idempotent on (user,date))
    const r2 = await daily.upsert(U, { localDate: '2026-06-22', gutSeverity: 8 });
    expect(r2.report.dailyScore).toBe(26); // 90 - 8*8
  });

  it('rejects malformed report dates before Postgres casts them', async () => {
    try {
      await daily.upsert(U, { localDate: '06/22/2026', gutSeverity: 2 });
      throw new Error('expected daily.upsert to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'invalid_local_date',
        message: 'Choose a valid report date.',
      });
    }
  });
});

describe('notifications-register-token', () => {
  it('registers and re-enables a device token', async () => {
    await notifications.registerToken(U, 'expo-token-abc', 'ios');
    await notifications.registerToken(U, 'expo-token-abc', 'ios'); // conflict -> re-enable
    const [{ c }] = await admin`select count(*)::int as c from public.device_tokens where user_id = ${U}`;
    expect(c).toBe(1);
  });
});

describe('scan crud', () => {
  it('reads, updates consumption, and lists history', async () => {
    const got = await crud.getScan(U, FOOD_SCAN);
    expect(got.scan.dishName).toBe('test dish');
    expect(got.scan.overallRiskScore).toBe(42);
    expect(got.scan.requestId).toBe('req-food-1');
    expect(got.scan.tokenCost).toBe(1);
    expect(got.scan.localDate).toEqual(expect.anything());
    expect(got.scan.timezone).toBe('America/Denver');
    expect(got.scan.imageUri).toContain('food.jpg');

    const cons = await crud.updateConsumption(U, FOOD_SCAN, 'consumed');
    expect(cons.consumptionStatus).toBe('consumed');
    // Old-client shape: no portion sent, none stored.
    expect(cons.consumptionPortion).toBeUndefined();

    // Portion round-trip: stored, readable, sticky for portion-less re-confirms,
    // and cleared when the meal is skipped.
    const heavy = await crud.updateConsumption(U, FOOD_SCAN, 'consumed', [], 'heavy');
    expect(heavy.consumptionPortion).toBe('heavy');
    const reread = await crud.getScan(U, FOOD_SCAN);
    expect(reread.scan.consumptionPortion).toBe('heavy');
    const reconfirm = await crud.updateConsumption(U, FOOD_SCAN, 'consumed');
    expect(reconfirm.consumptionPortion).toBe('heavy');
    const skipped = await crud.updateConsumption(U, FOOD_SCAN, 'skipped');
    expect(skipped.consumptionPortion).toBeUndefined();
    // Leave the scan how the original test left it: consumed.
    await crud.updateConsumption(U, FOOD_SCAN, 'consumed', [], 'normal');

    const hist = await crud.history(U, 1, 12);
    expect(hist.scans.length).toBeGreaterThan(0);
    const foodSummary = hist.scans.find((scan) => scan.id === FOOD_SCAN)!;
    expect(foodSummary.requestId).toBe('req-food-1');
    expect(foodSummary.analysisStatus).toBe('completed');
    expect(foodSummary.tokenCost).toBe(1);
    expect(foodSummary.localDate).toEqual(expect.anything());
    expect(foodSummary.timezone).toBe('America/Denver');
    expect(foodSummary.imageUri).toContain('food.jpg');
  });

  it('enriches ingredient risks with exact and related personal history', async () => {
    const got = await crud.getScan(U, FOOD_SCAN);
    const bread = got.scan.ingredientRisks.find((ingredient) => ingredient.canonicalName === 'bread');
    const turkey = got.scan.ingredientRisks.find((ingredient) => ingredient.canonicalName === 'turkey');
    const rye = got.scan.ingredientRisks.find((ingredient) => ingredient.canonicalName === 'rye');

    expect(bread?.personalHistory).toMatchObject({
      exactScanCount: 1,
      matchType: 'exact',
      riskLevel: 'high',
      supportingEvidenceCount: 3,
      negativeEvidenceCount: 3,
      summary: 'Seen 1 time · usually rough for you',
    });
    expect(turkey?.personalHistory).toMatchObject({
      exactScanCount: 0,
      matchType: 'none',
      riskLevel: 'unknown',
      summary: 'New for your history',
    });
    expect(rye?.personalHistory).toMatchObject({
      exactScanCount: 0,
      familyScanCount: 2,
      matchType: 'family',
      matchedLabel: 'bread',
      riskLevel: 'high',
    });
  });

  it('maps menu item nested ingredient risks and diet evaluations', async () => {
    const got = await crud.getScan(U, MENU_SCAN);
    expect(got.scan.menuResult?.inputPageCount).toBe(1);
    expect(got.scan.menuResult?.items[0]).toMatchObject({
      id: MENU_ITEM,
      sourceItemId: 'item-1',
      displayOrder: 0,
      scoringConfidence: 'high',
    });
    expect(got.scan.menuResult?.items[0].ingredientRisks[0]).toMatchObject({
      menuItemSourceId: 'item-1',
      canonicalName: 'salmon',
    });
    expect(got.scan.menuResult?.items[0].dietEvaluations[0]).toMatchObject({
      menuItemSourceId: 'item-1',
      dietKey: 'low_fodmap',
      status: 'fits',
    });
  });

  it('deletes a scan', async () => {
    const del = await crud.deleteScan(U, FOOD_SCAN);
    expect(del.ok).toBe(true);
    const [{ c }] = await admin`select count(*)::int as c from public.scans where id = ${FOOD_SCAN}`;
    expect(c).toBe(0);
  });
});

describe('account-delete', () => {
  it('cascade-deletes the user and all owned rows', async () => {
    await account.deleteAccount(U);
    const [{ c }] = await admin`select count(*)::int as c from public.users where id = ${U}`;
    expect(c).toBe(0);
    const [{ d }] = await admin`select count(*)::int as d from public.daily_gut_reports where user_id = ${U}`;
    expect(d).toBe(0);
  });
});

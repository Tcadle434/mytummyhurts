import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { BillingModule } from '../src/billing/billing.module';
import { BillingService } from '../src/billing/billing.service';
import { CommonModule } from '../src/common/common.module';
import { DatabaseModule } from '../src/database/database.module';
import { InsightsModule } from '../src/insights/insights.module';
import { InsightsService } from '../src/insights/insights.service';
import { ProfileModule } from '../src/profile/profile.module';
import { ProfileService } from '../src/profile/profile.service';
import { TaxonomyClassifierService } from '../src/taxonomy/taxonomy-classifier.service';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const U = '88888888-8888-8888-8888-888888888888';

let profile: ProfileService;
let insights: InsightsService;
let billing: BillingService;

beforeAll(async () => {
  process.env.OPENAI_API_KEY = 'test-key';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    const suspects = body.includes('spicy ramen')
      ? ['wheat pasta', 'spicy chili pepper', 'soy sauce', 'beer']
      : ['cream sauce', 'garlic', 'wheat bread'];
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        dishNames: [],
        suspectIngredients: suspects.map((canonicalName) => ({
          canonicalName,
          confidence: 'medium',
          source: 'dish_name',
          mechanisms: [],
        })),
        notes: [],
      }),
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      CommonModule,
      BillingModule,
      InsightsModule,
      ProfileModule,
    ],
  })
    .overrideProvider(TaxonomyClassifierService)
    .useValue(new TaxonomyClassifierService({
      get: (key: string) => key === 'OPENAI_API_KEY' ? '' : undefined,
    } as ConfigService))
    .compile();
  profile = moduleRef.get(ProfileService);
  insights = moduleRef.get(InsightsService);
  billing = moduleRef.get(BillingService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance, default_monthly_token_allowance)
              values (${U}, 'pb@test.dev', 'none', 40, 40)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  vi.unstubAllGlobals();
  process.env.OPENAI_API_KEY = '';
  await admin.end();
});

describe('profile-update', () => {
  it('upserts profile JSONB + syncs denormalized conditions/sensitivities', async () => {
    const r = await profile.update(U, {
      knownConditions: ['IBS', 'GERD / Acid reflux'],
      knownIngredientSensitivities: ['Garlic'],
      displayName: 'Tester',
    });
    expect(r.ok).toBe(true);
    expect(r.learningSyncStatus).toBe('updated');
    expect(r.displayName).toBe('Tester');
    expect(r.profile?.knownConditions).toContain('IBS');
    expect(r.profile?.stomachProfile.metadata.gutScore?.currentScore).toEqual(expect.any(Number));
    expect(r.insights?.some((insight) => insight.ingredientName.toLowerCase() === 'garlic')).toBe(true);

    const conds = await admin`select condition_key from public.user_conditions where user_id = ${U}`;
    expect(conds.map((c) => c.condition_key)).toContain('IBS');
    const sens = await admin`select ingredient_key from public.user_sensitivities where user_id = ${U}`;
    expect(sens.map((s) => s.ingredient_key)).toContain('Garlic');
  });

  it('persists onboarding calibration answers and custom health lists', async () => {
    await profile.update(U, {
      onboardingAnswers: {
        conditions: ['IBS'],
        customConditions: ['Histamine sensitivity'],
        ingredientSensitivities: ['Dairy'],
        customIngredientSensitivities: ['Avocado'],
        symptoms: ['Bloating'],
        customSymptoms: ['Cramping'],
        foodCalibrations: { Garlic: 'bad', Coffee: 'fine', Onion: 'unsure' },
        lastBadMealText: 'Chicken alfredo and garlic bread',
        favoriteFoodsToReintroduce: 'pizza, pasta',
        dietPreferenceKeys: ['low_fodmap', 'gerd_friendly'],
      },
    });

    const [row] = await admin`
      select known_conditions, known_ingredient_sensitivities, common_symptoms,
             calibration_ratings, last_bad_meal_text, foods_to_reintroduce
      from public.user_profiles where user_id = ${U}`;
    const dietRows = await admin`
      select diet_key, diet_label, strictness, source, priority, status
      from public.user_diet_preferences
      where user_id = ${U}
      order by priority`;

    expect(row.known_conditions).toEqual(['IBS', 'Histamine sensitivity']);
    expect(row.known_ingredient_sensitivities).toEqual(['Dairy', 'Avocado']);
    expect(row.common_symptoms).toEqual(['Bloating', 'Cramping']);
    expect(row.calibration_ratings).toEqual({ Garlic: 'bad', Coffee: 'fine', Onion: 'unsure' });
    expect(row.last_bad_meal_text).toBe('Chicken alfredo and garlic bread');
    expect(row.foods_to_reintroduce).toEqual(['pizza', 'pasta']);
    expect(dietRows.map((diet) => diet.diet_key)).toEqual(['low_fodmap', 'gerd_friendly']);
    expect(dietRows.map((diet) => diet.source)).toEqual(['onboarding', 'onboarding']);
  });

  it('persists and returns settings diet preferences', async () => {
    const r = await profile.update(U, {
      dietPreferences: [
        { key: 'dairy_free', label: 'ignored client label', strictness: 'standard', source: 'settings' },
        { key: 'seed_oil_free', label: 'Seed oil-free', strictness: 'strict', source: 'settings' },
      ],
    });

    const dietRows = await admin`
      select diet_key, diet_label, strictness, source, priority, status
      from public.user_diet_preferences
      where user_id = ${U}
      order by priority`;

    expect(dietRows).toEqual([
      expect.objectContaining({
        diet_key: 'dairy_free',
        diet_label: 'Dairy-free / lactose-free',
        strictness: 'standard',
        source: 'settings',
        priority: 0,
        status: 'active',
      }),
      expect.objectContaining({
        diet_key: 'seed_oil_free',
        diet_label: 'Seed oil-free',
        strictness: 'strict',
        source: 'settings',
        priority: 1,
        status: 'active',
      }),
    ]);
    expect(r.profile?.dietPreferences.map((diet) => diet.key)).toEqual(['dairy_free', 'seed_oil_free']);
  });

  it('clears settings diet preferences when no specific diet is selected', async () => {
    const r = await profile.update(U, { dietPreferences: [] });

    const dietRows = await admin`
      select diet_key from public.user_diet_preferences
      where user_id = ${U}`;
    expect(dietRows).toEqual([]);
    expect(r.profile?.dietPreferences).toEqual([]);
  });

  it('re-extracts stale last-bad-meal suspects immediately when the raw text changes', async () => {
    await admin`
      update public.user_profiles
      set last_bad_meal_text = 'old pasta',
          suspect_meal_ingredients = array['cream sauce']::text[],
          last_bad_meal_extracted_at = now()
      where user_id = ${U}`;

    await profile.update(U, {
      onboardingAnswers: {
        lastBadMealText: 'spicy ramen and beer',
      },
    });

    const [row] = await admin`
      select last_bad_meal_text, suspect_meal_ingredients, last_bad_meal_extracted_at
      from public.user_profiles where user_id = ${U}`;
    expect(row.last_bad_meal_text).toBe('spicy ramen and beer');
    expect(row.suspect_meal_ingredients).toEqual(['wheat pasta', 'spicy chili pepper', 'soy sauce', 'beer']);
    expect(row.last_bad_meal_extracted_at).toBeTruthy();
  });
});

describe('insights-get', () => {
  it('returns profile + (empty) insights + billing', async () => {
    const r = await insights.getInsights(U);
    expect(r.profile?.knownConditions).toContain('IBS');
    expect(r.profile?.stomachProfile.metadata.gutScore?.currentScore).toEqual(expect.any(Number));
    expect(Array.isArray(r.insights)).toBe(true);
    expect(r.billing.tokensRemaining).toBe(40);
  });
});

describe('billing-sync', () => {
  it('does not trust client-supplied subscription status without RevenueCat verification', async () => {
    const r = await billing.sync(U, { status: 'trialing', monthlyAllowance: 50 });
    expect(r.billing.subscriptionStatus).toBe('none');
    expect(r.billing.monthlyAllowance).toBe(40);
  });

  it('applies trusted server-side subscription updates', async () => {
    const r = await billing.applyTrustedSubscriptionState(U, { status: 'trialing', monthlyAllowance: 50 });
    expect(r.billing.subscriptionStatus).toBe('trialing');
    expect(r.billing.monthlyAllowance).toBe(50);
  });
});

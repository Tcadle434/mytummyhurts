import { Injectable, Logger } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { LearningRecomputeService } from '../learning/learning-recompute.service';
import { dietPreferenceLabels, normalizeDietPreferences } from '../scan/engine/dietRubric';
import type { FoodCalibrationRating } from '../scan/engine/domain';
import {
  buildLearningProgressFromRows,
  buildProfileFromRow,
  mapDietPreferenceRows,
  mapConditionInsight,
  mapGutScoreSnapshot,
  mapInsight,
} from '../user-context/profile-mapper';

export interface ProfileUpdateInput {
  onboardingAnswers?: Record<string, unknown>;
  displayName?: string | null;
  knownConditions?: string[];
  knownIngredientSensitivities?: string[];
  commonSymptoms?: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts?: string[];
  motivation?: string;
  currentEatingPatterns?: string[];
  lifestyleFactors?: string[];
  foodsToReintroduce?: string[];
  calibrationRatings?: Record<string, unknown>;
  lastBadMealText?: string;
  dietPreferences?: unknown[];
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function mergeAnswerArrays(...values: unknown[]) {
  let sawArray = false;
  const merged: string[] = [];
  for (const value of values) {
    const strings = stringArray(value);
    if (!strings) continue;
    sawArray = true;
    merged.push(...strings);
  }
  return sawArray ? [...new Set(merged)] : undefined;
}

function calibrationRatings(value: unknown): Record<string, FoodCalibrationRating> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, FoodCalibrationRating>>(
    (accumulator, [food, rating]) => {
      const normalizedFood = food.trim();
      if (!normalizedFood) return accumulator;
      if (rating === 'fine' || rating === 'unsure' || rating === 'bad') {
        accumulator[normalizedFood] = rating;
      }
      return accumulator;
    },
    {},
  );
}

function splitFoodsToReintroduce(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return stringArray(value) ?? [];
  if (typeof value !== 'string') return undefined;
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function optionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger('ProfileService');

  constructor(
    private readonly db: DatabaseService,
    private readonly billing: BillingService,
    private readonly learning: LearningJobService,
    private readonly recompute: LearningRecomputeService,
  ) {}

  async update(userId: string, req: ProfileUpdateInput) {
    const a = (req.onboardingAnswers ?? {}) as Record<string, unknown>;
    const conditions = req.knownConditions ?? mergeAnswerArrays(a.conditions, a.customConditions);
    const sensitivities = req.knownIngredientSensitivities ?? mergeAnswerArrays(a.ingredientSensitivities, a.customIngredientSensitivities);
    const symptoms = req.commonSymptoms ?? mergeAnswerArrays(a.symptoms, a.customSymptoms);
    const displayName = req.displayName ?? (a.displayName as string);
    const symptomFrequency = req.symptomFrequency ?? (a.symptomFrequency as string);
    const symptomSeverityBaseline = req.symptomSeverityBaseline ?? (a.symptomSeverityBaseline as string);
    const mealContexts = req.mealContexts ?? (a.mealContexts as string[]);
    const motivation = req.motivation ?? (a.motivation as string);
    const currentEatingPatterns = req.currentEatingPatterns ?? (a.currentEatingPatterns as string[]);
    const lifestyleFactors = req.lifestyleFactors ?? (a.lifestyleFactors as string[]);
    const foodsToReintroduce = req.foodsToReintroduce ?? splitFoodsToReintroduce(a.favoriteFoodsToReintroduce);
    const ratings = calibrationRatings(req.calibrationRatings ?? a.foodCalibrations);
    const lastBadMealText = req.lastBadMealText ?? optionalNonEmptyString(a.lastBadMealText);
    const lastBadMealTextParam = lastBadMealText ?? null;
    const rawDietPreferences =
      req.dietPreferences !== undefined
        ? req.dietPreferences
        : a.dietPreferenceKeys !== undefined
          ? a.dietPreferenceKeys
          : undefined;
    const dietPreferences = rawDietPreferences === undefined
      ? undefined
      : normalizeDietPreferences(rawDietPreferences);

    await this.db.service(async (sql) => {
      // jsonb params: pass via sql.json (single-encoded). null -> coalesce keeps
      // the existing value. (JSON.stringify + ::jsonb double-encodes — avoid it.)
      const jb = (v: unknown) => (v == null ? null : sql.json(v as never));
      await sql`insert into public.user_profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
      await sql`update public.user_profiles set
        known_conditions = coalesce(${jb(conditions)}, known_conditions),
        known_ingredient_sensitivities = coalesce(${jb(sensitivities)}, known_ingredient_sensitivities),
        common_symptoms = coalesce(${jb(symptoms)}, common_symptoms),
        symptom_frequency = coalesce(${symptomFrequency ?? null}::text, symptom_frequency),
        symptom_severity_baseline = coalesce(${symptomSeverityBaseline ?? null}::text, symptom_severity_baseline),
        meal_contexts = coalesce(${jb(mealContexts)}, meal_contexts),
        motivation = coalesce(${motivation ?? null}::text, motivation),
        current_eating_patterns = coalesce(${jb(currentEatingPatterns)}, current_eating_patterns),
        lifestyle_factors = coalesce(${jb(lifestyleFactors)}, lifestyle_factors),
        foods_to_reintroduce = coalesce(${jb(foodsToReintroduce)}, foods_to_reintroduce),
        calibration_ratings = coalesce(${jb(ratings)}, calibration_ratings),
        suspect_meal_ingredients = case
          when ${lastBadMealTextParam}::text is not null and ${lastBadMealTextParam}::text is distinct from last_bad_meal_text then '{}'::text[]
          else suspect_meal_ingredients
        end,
        last_bad_meal_extracted_at = case
          when ${lastBadMealTextParam}::text is not null and ${lastBadMealTextParam}::text is distinct from last_bad_meal_text then null
          else last_bad_meal_extracted_at
        end,
        last_bad_meal_text = coalesce(${lastBadMealTextParam}::text, last_bad_meal_text),
        display_name = coalesce(${displayName ?? null}::text, display_name),
        updated_at = now()
        where user_id = ${userId}`;

      // Sync denormalized read-models (JSONB stays source of truth).
      if (conditions) {
        await sql`delete from public.user_conditions where user_id = ${userId}`;
        for (const c of conditions) {
          await sql`insert into public.user_conditions (user_id, condition_key) values (${userId}, ${c})
                    on conflict do nothing`;
        }
      }
      if (sensitivities) {
        await sql`delete from public.user_sensitivities where user_id = ${userId}`;
        for (const s of sensitivities) {
          await sql`insert into public.user_sensitivities (user_id, ingredient_key) values (${userId}, ${s})
                    on conflict do nothing`;
        }
      }
      if (dietPreferences) {
        await sql`delete from public.user_diet_preferences where user_id = ${userId}`;
        for (const [priority, preference] of dietPreferences.entries()) {
          await sql`insert into public.user_diet_preferences
              (user_id, diet_key, diet_label, strictness, source, priority, status)
            values (${userId}, ${preference.key}, ${dietPreferenceLabels[preference.key]},
              ${preference.strictness}, ${preference.source}, ${priority}, 'active')`;
        }
      }
    });

    let learningSyncStatus: 'updated' | 'queued' | 'failed' = 'updated';
    try {
      await this.recompute.rebuild(userId, 'profile');
    } catch (error) {
      this.logger.warn(`immediate profile learning recompute failed for user ${userId}: ${(error as Error).message}`);
      try {
        await this.learning.enqueue({ userId, eventType: 'profile_updated', sourceType: 'profile', sourceId: null });
        learningSyncStatus = 'queued';
      } catch (enqueueError) {
        learningSyncStatus = 'failed';
        this.logger.error(`profile learning enqueue failed for user ${userId}: ${(enqueueError as Error).message}`);
      }
    }

    return this.readProfileUpdateResponse(userId, learningSyncStatus);
  }

  private readProfileUpdateResponse(userId: string, learningSyncStatus: 'updated' | 'queued' | 'failed') {
    return this.db.service(async (sql) => {
      const insights = await sql`select i.*,
            c.primary_food_family_key as taxonomy_primary_food_family_key,
            c.digestive_pattern_keys as taxonomy_digestive_pattern_keys,
            c.confidence as taxonomy_confidence,
            c.reason as taxonomy_reason,
            c.taxonomy_version as taxonomy_version,
            c.model as taxonomy_model,
            c.prompt_version as taxonomy_prompt_version,
            c.source as taxonomy_source
          from public.ingredient_insights i
          left join public.ingredient_taxonomy_classifications c
            on c.normalized_ingredient_name = btrim(regexp_replace(lower(i.ingredient_name), '[^a-z0-9]+', ' ', 'g'))
          where i.user_id = ${userId}
          order by i.combined_risk_score desc nulls last limit 200`;
      const conditionInsights = await sql`select * from public.condition_ingredient_insights
        where user_id = ${userId} order by risk_score desc limit 200`;
      const [row] = await sql`select * from public.user_profiles where user_id = ${userId}`;
      const dietRows = await sql`
        select diet_key, diet_label, strictness, source, priority, status
        from public.user_diet_preferences
        where user_id = ${userId} and status = 'active'
        order by priority asc, created_at asc`;
      const gutScoreSnapshots = await sql`
        select * from public.gut_score_snapshots
        where user_id = ${userId}
        order by created_at desc limit 14`;
      const learningScanRows = await sql`
        select id, title, scan_category, consumption_status, local_date, created_at
        from public.scans
        where user_id = ${userId} and analysis_status = 'completed'`;
      const learningReportRows = await sql`
        select id, local_date, created_at
        from public.daily_gut_reports
        where user_id = ${userId}`;
      const learningProgress = buildLearningProgressFromRows(learningScanRows, learningReportRows);
      const billing = await this.billing.getBillingState(userId, sql);
      const mappedInsights = insights.map(mapInsight);
      return {
        ok: true as const,
        profile: buildProfileFromRow(userId, row, {
          insights: mappedInsights,
          gutScore: mapGutScoreSnapshot(gutScoreSnapshots[0], gutScoreSnapshots),
          learningProgress,
          reportCount: learningReportRows.length,
          dietPreferences: mapDietPreferenceRows(dietRows),
        }),
        insights: mappedInsights,
        conditionInsights: conditionInsights.map(mapConditionInsight),
        billing,
        displayName: (row?.display_name as string) ?? null,
        learningSyncStatus,
      };
    });
  }
}

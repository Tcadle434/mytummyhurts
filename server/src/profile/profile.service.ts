import { Injectable } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { buildProfileFromRow } from '../user-context/profile-mapper';

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
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly billing: BillingService,
    private readonly learning: LearningJobService,
  ) {}

  async update(userId: string, req: ProfileUpdateInput) {
    const a = (req.onboardingAnswers ?? {}) as Record<string, unknown>;
    const conditions = req.knownConditions ?? (a.conditions as string[]);
    const sensitivities = req.knownIngredientSensitivities ?? (a.ingredientSensitivities as string[]);
    const symptoms = req.commonSymptoms ?? (a.symptoms as string[]);
    const displayName = req.displayName ?? (a.displayName as string);
    const symptomFrequency = req.symptomFrequency ?? (a.symptomFrequency as string);
    const symptomSeverityBaseline = req.symptomSeverityBaseline ?? (a.symptomSeverityBaseline as string);
    const mealContexts = req.mealContexts ?? (a.mealContexts as string[]);
    const motivation = req.motivation ?? (a.motivation as string);
    const currentEatingPatterns = req.currentEatingPatterns ?? (a.currentEatingPatterns as string[]);
    const lifestyleFactors = req.lifestyleFactors ?? (a.lifestyleFactors as string[]);
    const foodsToReintroduce = req.foodsToReintroduce ?? (a.favoriteFoodsToReintroduce as string[] | undefined);

    const result = await this.db.service(async (sql) => {
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

      const [row] = await sql`select * from public.user_profiles where user_id = ${userId}`;
      const billing = await this.billing.getBillingState(userId, sql);
      return {
        ok: true as const,
        profile: buildProfileFromRow(userId, row),
        billing,
        displayName: (row?.display_name as string) ?? null,
        learningSyncStatus: 'queued' as const,
      };
    });

    await this.learning.enqueue({ userId, eventType: 'profile_updated', sourceType: 'profile', sourceId: null });
    return result;
  }
}

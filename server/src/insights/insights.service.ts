import { Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { LearningRecomputeService } from '../learning/learning-recompute.service';
import {
  buildLearningProgressFromRows,
  buildProfileFromRow,
  mapDietPreferenceRows,
  mapConditionInsight,
  mapGutScoreSnapshot,
  mapInsight,
} from '../user-context/profile-mapper';

@Injectable()
export class InsightsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly billing: BillingService,
    private readonly learning: LearningJobService,
    private readonly recomputeService: LearningRecomputeService,
  ) {}

  private async read(userId: string, sql: Sql, search?: string, limit = 200) {
    const insights = search
      ? await sql`select i.*,
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
          where i.user_id = ${userId} and i.ingredient_name ilike ${`%${search}%`}
          order by i.combined_risk_score desc nulls last limit ${limit}`
      : await sql`select i.*,
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
          order by i.combined_risk_score desc nulls last limit ${limit}`;
    const conditionInsights = await sql`select * from public.condition_ingredient_insights
      where user_id = ${userId} order by risk_score desc limit ${limit}`;
    const [profileRow] = await sql`select * from public.user_profiles where user_id = ${userId}`;
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
    const mappedInsights = insights.map(mapInsight);
    return {
      profile: buildProfileFromRow(userId, profileRow, {
        insights: mappedInsights,
        gutScore: mapGutScoreSnapshot(gutScoreSnapshots[0], gutScoreSnapshots),
        learningProgress,
        reportCount: learningReportRows.length,
        dietPreferences: mapDietPreferenceRows(dietRows),
      }),
      insights: mappedInsights,
      conditionInsights: conditionInsights.map(mapConditionInsight),
    };
  }

  async getInsights(userId: string, search?: string, limit = 200) {
    return this.db.service(async (sql) => {
      const data = await this.read(userId, sql, search, limit);
      const billing = await this.billing.getBillingState(userId, sql);
      return { ...data, billing };
    });
  }

  /**
   * learning-recompute: the deterministic recompute (rebuildInsightsAndProfile)
   * is enqueued for the worker; this returns the CURRENT profile + insights so
   * the app refreshes immediately. Status 'updated' = current state returned.
   */
  async recompute(userId: string, sourceType: string, sourceId?: string) {
    // Run the recompute synchronously so the caller gets fresh insights + gut
    // score immediately. On failure, fall back to returning current state.
    let status: 'updated' | 'failed' = 'updated';
    try {
      await this.recomputeService.rebuild(userId, sourceType, sourceId);
    } catch {
      status = 'failed';
      await this.learning.enqueue({ userId, eventType: 'learning_recompute', sourceType, sourceId: sourceId ?? null });
    }
    return this.db.service(async (sql) => {
      const data = await this.read(userId, sql);
      return { ok: true as const, learningSyncStatus: status, ...data };
    });
  }
}

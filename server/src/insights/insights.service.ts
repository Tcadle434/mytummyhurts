import { Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { LearningRecomputeService } from '../learning/learning-recompute.service';
import {
  buildProfileFromRow,
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
      ? await sql`select * from public.ingredient_insights
          where user_id = ${userId} and ingredient_name ilike ${`%${search}%`}
          order by combined_risk_score desc nulls last limit ${limit}`
      : await sql`select * from public.ingredient_insights
          where user_id = ${userId}
          order by combined_risk_score desc nulls last limit ${limit}`;
    const conditionInsights = await sql`select * from public.condition_ingredient_insights
      where user_id = ${userId} order by risk_score desc limit ${limit}`;
    const [profileRow] = await sql`select * from public.user_profiles where user_id = ${userId}`;
    const gutScoreSnapshots = await sql`
      select * from public.gut_score_snapshots
      where user_id = ${userId}
      order by created_at desc limit 14`;
    const mappedInsights = insights.map(mapInsight);
    return {
      profile: buildProfileFromRow(userId, profileRow, {
        insights: mappedInsights,
        gutScore: mapGutScoreSnapshot(gutScoreSnapshots[0], gutScoreSnapshots),
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

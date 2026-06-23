import { Injectable } from '@nestjs/common';

import { BillingService } from '../billing/billing.service';
import { DatabaseService } from '../database/database.service';
import { mapDailyReport } from '../scan/scan-crud.service';
import {
  buildProfileFromRow,
  mapConditionInsight,
  mapGutScoreSnapshot,
  mapInsight,
} from '../user-context/profile-mapper';

@Injectable()
export class HomeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly billing: BillingService,
  ) {}

  async getHome(userId: string) {
    return this.db.service(async (sql) => {
      const [profileRow] = await sql`select * from public.user_profiles where user_id = ${userId}`;
      const billing = await this.billing.getBillingState(userId, sql);

      const recentScans = (
        await sql`
          select id, title, scan_category, source_type, overall_risk_score, overall_risk_level,
                 consumption_status, local_date, created_at, completed_at
          from public.scans
          where user_id = ${userId} and analysis_status = 'completed'
          order by created_at desc limit 50`
      ).map((s) => ({
        id: s.id,
        dishName: s.title,
        scanCategory: s.scan_category,
        sourceType: s.source_type,
        overallRiskScore: s.overall_risk_score,
        overallRiskLevel: s.overall_risk_level,
        consumptionStatus: s.consumption_status,
        localDate: s.local_date
          ? s.local_date instanceof Date
            ? s.local_date.toISOString().slice(0, 10)
            : String(s.local_date).slice(0, 10)
          : undefined,
        createdAt: s.created_at,
        completedAt: s.completed_at,
      }));

      const dailyReports = (
        await sql`select * from public.daily_gut_reports where user_id = ${userId}
                  order by local_date desc limit 30`
      ).map(mapDailyReport);

      const triggers = (
        await sql`select * from public.ingredient_insights where user_id = ${userId}
                  order by combined_risk_score desc nulls last limit 8`
      ).map(mapInsight);
      const safeFoods = (
        await sql`select * from public.ingredient_insights where user_id = ${userId}
                  order by combined_risk_score asc nulls last limit 8`
      ).map(mapInsight);
      const conditionInsights = (
        await sql`select * from public.condition_ingredient_insights where user_id = ${userId}
                  order by risk_score desc limit 12`
      ).map(mapConditionInsight);
      const gutScoreSnapshots = await sql`
        select * from public.gut_score_snapshots
        where user_id = ${userId}
        order by created_at desc limit 14`;

      const [snap] = await sql`select learning_status from public.user_app_snapshots where user_id = ${userId}`;
      const now = new Date().toISOString();
      const profileInsights = [...new Map(
        [...triggers, ...safeFoods].map((insight) => [insight.id || insight.ingredientName, insight]),
      ).values()];

      return {
        ok: true as const,
        snapshotVersion: Date.now(),
        profile: buildProfileFromRow(userId, profileRow, {
          insights: profileInsights,
          gutScore: mapGutScoreSnapshot(gutScoreSnapshots[0], gutScoreSnapshots),
        }),
        billing,
        recentScans,
        dailyReports,
        insightSummary: { triggers, safeFoods, conditionInsights },
        learningStatus: (snap?.learning_status as string) ?? 'idle',
        generatedAt: now,
        serverTime: now,
      };
    });
  }
}

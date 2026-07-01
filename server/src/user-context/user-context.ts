import type { Sql } from 'postgres';

type Row = Record<string, unknown>;

export interface UserContextLimits {
  /** LIMIT for the ingredient_insights ⨝ taxonomy read (DESC by combined_risk_score). */
  insightsLimit: number;
  /** LIMIT for the condition_ingredient_insights read (DESC by risk_score). */
  conditionInsightsLimit: number;
}

export interface UserContext {
  insightRows: Row[];
  conditionInsightRows: Row[];
  profileRow: Row | undefined;
  dietRows: Row[];
  gutScoreSnapshots: Row[];
  learningScanRows: Row[];
  learningReportRows: Row[];
}

/**
 * Shared read-block for user profile context. Runs the queries that both
 * HomeService.getHome and ProfileService.readProfileUpdateResponse need.
 *
 * Behavior-preserving extraction: queries are byte-for-byte equivalent to the
 * originals; only the LIMIT values are parameterized (they already differed
 * between the two call sites). The independent reads run via Promise.all.
 */
export async function getUserContext(
  sql: Sql,
  userId: string,
  opts: UserContextLimits,
): Promise<UserContext> {
  const [
    insightRows,
    conditionInsightRows,
    profileRows,
    dietRows,
    gutScoreSnapshots,
    learningScanRows,
    learningReportRows,
  ] = await Promise.all([
    sql`select i.*,
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
        order by (i.supporting_evidence_count > 0) desc, i.combined_risk_score desc nulls last limit ${opts.insightsLimit}`,
    sql`select * from public.condition_ingredient_insights
        where user_id = ${userId} order by risk_score desc limit ${opts.conditionInsightsLimit}`,
    sql`select * from public.user_profiles where user_id = ${userId}`,
    sql`
        select diet_key, diet_label, strictness, source, priority, status
        from public.user_diet_preferences
        where user_id = ${userId} and status = 'active'
        order by priority asc, created_at asc`,
    sql`
        select * from public.gut_score_snapshots
        where user_id = ${userId}
        order by created_at desc limit 14`,
    sql`
        select id, title, scan_category, consumption_status, local_date, created_at
        from public.scans
        where user_id = ${userId} and analysis_status = 'completed'`,
    sql`
        select id, local_date, created_at
        from public.daily_gut_reports
        where user_id = ${userId}`,
  ]);

  return {
    insightRows,
    conditionInsightRows,
    profileRow: profileRows[0],
    dietRows,
    gutScoreSnapshots,
    learningScanRows,
    learningReportRows,
  };
}

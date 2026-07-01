import { Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';

import { DatabaseService } from '../database/database.service';
import type {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  ProfileSeed,
  StructuredIngredient,
} from '../scan/engine/domain';
import {
  buildDailyConditionInsights,
  buildDailyReportInsights,
  structuredAnalysisFromIngredientRows,
} from '../scan/engine/insights-learning';
import {
  GUT_SCORE_ALGORITHM_VERSION,
  buildDeclaredSeedInsights,
  buildGutScoreEvent,
  computeGutScoreState,
  mergeSeedAndLearnedInsights,
  recomputeDailyScores,
} from '../scan/engine/scoring';
import { TaxonomyClassifierService } from '../taxonomy/taxonomy-classifier.service';
import { LastBadMealExtractionService } from './last-bad-meal-extraction.service';

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const calibrationRatings = (v: unknown): Record<string, 'fine' | 'unsure' | 'bad'> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.entries(v as Record<string, unknown>).reduce<Record<string, 'fine' | 'unsure' | 'bad'>>(
    (accumulator, [food, rating]) => {
      if (rating === 'fine' || rating === 'unsure' || rating === 'bad') {
        accumulator[food] = rating;
      }
      return accumulator;
    },
    {},
  );
};

// postgres.js returns date/timestamp columns as Date objects; the engine's
// localDateMinusDays expects a 'YYYY-MM-DD' string.
const toLocalDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10);
const toIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));

type GutScoreMovementSource = 'scan' | 'daily_report' | 'profile' | 'backfill';

function normalizedDailyScore(score: unknown) {
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : undefined;
}

function reportEventTime(report: DailyGutReport) {
  const value = report.dailyScoreUpdatedAt ?? report.updatedAt ?? report.localDate;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function mostRecentDailyReport(reports: DailyGutReport[]) {
  return [...reports].sort((left, right) => reportEventTime(right) - reportEventTime(left))[0];
}

function normalizeMovementSource(sourceType: string): GutScoreMovementSource | undefined {
  if (sourceType === 'daily_report' || sourceType === 'daily_gut_report') return 'daily_report';
  if (sourceType === 'scan') return 'scan';
  if (sourceType === 'profile') return 'profile';
  if (sourceType === 'backfill') return 'backfill';
  return undefined;
}

function resolveGutScoreMovement(input: {
  sourceType: string;
  sourceId?: string;
  scoredReports: DailyGutReport[];
  changedDailyReports: DailyGutReport[];
}): { source?: GutScoreMovementSource; dailyScore?: number } {
  const source = normalizeMovementSource(input.sourceType);
  if (source === 'daily_report') {
    const submittedReport = input.sourceId
      ? input.scoredReports.find((report) => report.id === input.sourceId)
      : undefined;
    const report = submittedReport ?? mostRecentDailyReport(input.scoredReports);
    return { source: 'daily_report', dailyScore: report?.dailyScore };
  }

  if (source === 'scan') {
    const report = mostRecentDailyReport(input.changedDailyReports);
    return report
      ? { source: 'daily_report', dailyScore: report.dailyScore }
      : { source: 'scan' };
  }

  return { source };
}

/**
 * Port of rebuildInsightsAndProfile (Supabase _shared/profile.ts), re-homed onto
 * the NestJS DB layer. Recomputes learned ingredient insights + condition
 * insights + daily scores + the gut score from a user's scans & daily reports,
 * and persists them. The one-shot onboarding "last bad meal" LLM extraction is
 * best-effort and runs before the seed insights are rebuilt.
 */
@Injectable()
export class LearningRecomputeService {
  private readonly logger = new Logger('LearningRecompute');

  constructor(
    private readonly db: DatabaseService,
    private readonly taxonomy: TaxonomyClassifierService,
    private readonly lastBadMeal: LastBadMealExtractionService,
  ) {}

  async rebuild(userId: string, sourceType = 'profile', sourceId?: string) {
    try {
      await this.lastBadMeal.extractAndPersistIfNeeded(userId);
    } catch (error) {
      this.logger.warn(`last bad meal extraction skipped for user ${userId}: ${(error as Error).message}`);
    }

    return this.db.service(async (sql) => {
      const [profileRow] = await sql`select * from public.user_profiles where user_id = ${userId}`;
      if (!profileRow) return { insights: 0, conditionInsights: 0, dailyReports: 0 };

      const scanRows = await sql`
        select id, scan_category, local_date, title, overall_risk_score, created_at, consumption_status
        from public.scans where user_id = ${userId} and analysis_status = 'completed'`;
      const reportRows = await sql`select * from public.daily_gut_reports where user_id = ${userId}`;
      const ingredientRows = await sql`
        select scan_id, canonical_name, confidence, menu_item_source_id
        from public.scan_ingredient_risks where user_id = ${userId}`;
      const dietRows = await sql`
        select diet_key, diet_label, strictness, source, priority, status
        from public.user_diet_preferences where user_id = ${userId} and status = 'active'`;

      // ingredients per scan (non-menu) — used as the food exposure signal.
      const scanIngredients = new Map<string, StructuredIngredient[]>();
      for (const r of ingredientRows) {
        if (r.menu_item_source_id) continue;
        const name = String(r.canonical_name ?? '').trim().toLowerCase();
        if (!name) continue;
        const conf = r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium';
        const list = scanIngredients.get(String(r.scan_id)) ?? [];
        list.push({ name, confidence: conf } as StructuredIngredient);
        scanIngredients.set(String(r.scan_id), list);
      }

      const seed = {
        userId,
        displayName: profileRow.display_name ?? undefined,
        knownConditions: arr(profileRow.known_conditions),
        knownIngredientSensitivities: arr(profileRow.known_ingredient_sensitivities),
        commonSymptoms: arr(profileRow.common_symptoms),
        symptomFrequency: profileRow.symptom_frequency ?? undefined,
        symptomSeverityBaseline: profileRow.symptom_severity_baseline ?? undefined,
        mealContexts: arr(profileRow.meal_contexts),
        motivation: profileRow.motivation ?? undefined,
        currentEatingPatterns: arr(profileRow.current_eating_patterns),
        lifestyleFactors: arr(profileRow.lifestyle_factors),
        foodsToReintroduce: arr(profileRow.foods_to_reintroduce),
        calibrationRatings: calibrationRatings(profileRow.calibration_ratings),
        dietPreferences: dietRows.map((d) => ({
          key: d.diet_key,
          label: d.diet_label,
          strictness: d.strictness,
          source: d.source === 'settings' ? 'settings' : 'onboarding',
        })),
        suspectMealIngredients: arr(profileRow.suspect_meal_ingredients),
      } as ProfileSeed;

      // Food exposures: completed, non-skipped food scans with their ingredients.
      const foodScans = scanRows
        .filter((s) => (s.scan_category ?? 'food') === 'food' && s.consumption_status !== 'skipped')
        .map((s) => {
          const ingredients = scanIngredients.get(String(s.id)) ?? [];
          return {
            id: String(s.id),
            structuredAnalysis: structuredAnalysisFromIngredientRows(s.title ?? '', ingredients),
            ingredients,
            overallRiskScore: s.overall_risk_score ?? undefined,
            createdAt: toIso(s.created_at),
            localDate: s.local_date ? toLocalDate(s.local_date) : toLocalDate(s.created_at),
            scanCategory: 'food' as const,
          };
        });

      const reports: DailyGutReport[] = reportRows.map(this.mapReport);
      const scoredReports = recomputeDailyScores(reports, foodScans as never);
      const changedDailyReports = scoredReports.filter((report) => {
        const previous = reports.find((candidate) => candidate.id === report.id || candidate.localDate === report.localDate);
        return normalizedDailyScore(previous?.dailyScore) !== normalizedDailyScore(report.dailyScore);
      });

      // Persist recomputed daily scores. Each report targets a distinct local_date,
      // so the updates are independent and can run in parallel within the transaction.
      await Promise.all(
        scoredReports.map((r) => sql`update public.daily_gut_reports
          set daily_score = ${r.dailyScore ?? null},
              daily_score_components = ${sql.json((r.dailyScoreComponents ?? {}) as never)},
              daily_score_drivers = ${sql.json((r.dailyScoreDrivers ?? []) as never)},
              daily_score_updated_at = now()
          where user_id = ${userId} and local_date = ${r.localDate}`),
      );

      const learned = buildDailyReportInsights({
        scans: foodScans.map((s) => ({ id: s.id, localDate: s.localDate, createdAt: s.createdAt, ingredients: s.ingredients })),
        reports: scoredReports,
        declaredSensitivities: seed.knownIngredientSensitivities,
        activeConditions: seed.knownConditions,
      });
      const insights = mergeSeedAndLearnedInsights(learned, buildDeclaredSeedInsights(seed));
      const conditionInsights = buildDailyConditionInsights(insights, seed.knownConditions);

      await this.persistInsights(sql, userId, insights, conditionInsights);
      try {
        // Classify only evidence-backed insights: exposure-only watching rows
        // (up to 100 per user) fall back to alias-based family grouping in the
        // app, and classifying them here would queue that many sequential LLM
        // calls inside a synchronous recompute.
        await this.taxonomy.ensureClassifications(
          sql,
          insights.filter((insight) => insight.supportingEvidenceCount > 0),
        );
      } catch (error) {
        this.logger.warn(`taxonomy classification skipped for user ${userId}: ${(error as Error).message}`);
      }

      // Gut score.
      const [prevSnap] = await sql`
        select * from public.gut_score_snapshots where user_id = ${userId}
        order by created_at desc limit 1`;
      const previousGutScore = prevSnap ? this.mapSnapshot(prevSnap) : null;
      const movement = resolveGutScoreMovement({
        sourceType,
        sourceId,
        scoredReports,
        changedDailyReports,
      });
      const gutScore = computeGutScoreState({
        seed,
        insights,
        scans: foodScans as never,
        dailyReports: scoredReports,
        previousGutScore,
        movementSource: movement.source,
        movementDailyScore: movement.dailyScore,
      });
      const event = buildGutScoreEvent({ eventType: sourceType, score: gutScore, previousScore: previousGutScore, sourceType, sourceId });
      await this.persistGutScore(sql, userId, gutScore, event, sourceType, sourceId);

      await sql`
        insert into public.user_app_snapshots (user_id, learning_status, last_recomputed_at, last_source_type, last_source_id)
        values (${userId}, 'idle', now(), ${sourceType}, ${sourceId ?? null})
        on conflict (user_id) do update set learning_status = 'idle', last_recomputed_at = now(),
          last_source_type = ${sourceType}, last_source_id = ${sourceId ?? null}`;

      this.logger.log(`recomputed user ${userId}: ${insights.length} insights, gut score ${gutScore.currentScore}`);
      return { insights: insights.length, conditionInsights: conditionInsights.length, dailyReports: scoredReports.length };
    });
  }

  private mapReport = (r: Record<string, unknown>): DailyGutReport =>
    ({
      id: r.id,
      localDate: toLocalDate(r.local_date),
      gutSeverity: r.gut_severity,
      symptomTags: arr(r.symptom_tags),
      notes: r.notes ?? undefined,
      dailyScore: (r.daily_score as number) ?? undefined,
      dailyScoreComponents: r.daily_score_components ?? undefined,
      evidenceQuality: (r.evidence_quality as string) ?? undefined,
      createdAt: toIso(r.created_at),
      updatedAt: toIso(r.updated_at),
    }) as unknown as DailyGutReport;

  private mapSnapshot(s: Record<string, unknown>) {
    return {
      algorithmVersion: GUT_SCORE_ALGORITHM_VERSION,
      currentScore: s.score,
      baselineScore: s.baseline_score,
      phase: s.phase,
      confidenceLevel: s.confidence_level,
      trendDelta7d: s.trend_delta_7d ?? 0,
      components: s.components ?? {},
      drivers: s.drivers ?? [],
      updatedAt: s.created_at,
    } as never;
  }

  private async persistInsights(
    sql: Sql,
    userId: string,
    insights: IngredientInsight[],
    conditionInsights: ConditionIngredientInsight[],
  ) {
    await sql`delete from public.ingredient_insights where user_id = ${userId}`;
    await sql`delete from public.condition_ingredient_insights where user_id = ${userId}`;
    if (insights.length) {
      const insightRows = insights.map((i) => ({
        user_id: userId,
        ingredient_name: i.ingredientName,
        trigger_score: i.triggerScore,
        safe_score: i.safeScore,
        combined_risk_score: i.combinedRiskScore,
        confidence_level: i.confidenceLevel,
        pattern_strength: i.patternStrength,
        linked_conditions: sql.json(i.linkedConditions as never),
        supporting_evidence_count: i.supportingEvidenceCount,
        positive_evidence_count: i.positiveEvidenceCount,
        negative_evidence_count: i.negativeEvidenceCount,
        last_seen_at: i.lastSeenAt ?? null,
        last_outcome_at: i.lastOutcomeAt ?? null,
        source_breakdown: sql.json(i.sourceBreakdown as never),
        last_recomputed_at: i.lastRecomputedAt,
      }));
      await sql`insert into public.ingredient_insights ${sql(
        insightRows,
        'user_id', 'ingredient_name', 'trigger_score', 'safe_score', 'combined_risk_score',
        'confidence_level', 'pattern_strength', 'linked_conditions', 'supporting_evidence_count',
        'positive_evidence_count', 'negative_evidence_count', 'last_seen_at', 'last_outcome_at',
        'source_breakdown', 'last_recomputed_at',
      )}
        on conflict (user_id, ingredient_name) do update set
          trigger_score = excluded.trigger_score, safe_score = excluded.safe_score,
          combined_risk_score = excluded.combined_risk_score, confidence_level = excluded.confidence_level,
          pattern_strength = excluded.pattern_strength, linked_conditions = excluded.linked_conditions,
          supporting_evidence_count = excluded.supporting_evidence_count,
          positive_evidence_count = excluded.positive_evidence_count,
          negative_evidence_count = excluded.negative_evidence_count, last_seen_at = excluded.last_seen_at,
          last_outcome_at = excluded.last_outcome_at, source_breakdown = excluded.source_breakdown,
          last_recomputed_at = excluded.last_recomputed_at`;
    }
    if (conditionInsights.length) {
      const conditionRows = conditionInsights.map((c) => ({
        user_id: userId,
        ingredient_name: c.ingredientName,
        condition_name: c.conditionName,
        risk_score: c.riskScore,
        trigger_score: c.triggerScore,
        safe_score: c.safeScore,
        confidence_level: c.confidenceLevel,
        positive_evidence_count: c.positiveEvidenceCount,
        negative_evidence_count: c.negativeEvidenceCount,
        supporting_evidence_count: c.supportingEvidenceCount,
        source_breakdown: sql.json(c.sourceBreakdown as never),
        last_seen_at: c.lastSeenAt ?? null,
        last_outcome_at: c.lastOutcomeAt ?? null,
        last_recomputed_at: c.lastRecomputedAt,
      }));
      await sql`insert into public.condition_ingredient_insights ${sql(
        conditionRows,
        'user_id', 'ingredient_name', 'condition_name', 'risk_score', 'trigger_score', 'safe_score',
        'confidence_level', 'positive_evidence_count', 'negative_evidence_count',
        'supporting_evidence_count', 'source_breakdown', 'last_seen_at', 'last_outcome_at',
        'last_recomputed_at',
      )}
        on conflict (user_id, ingredient_name, condition_name) do update set
          risk_score = excluded.risk_score, trigger_score = excluded.trigger_score,
          safe_score = excluded.safe_score, confidence_level = excluded.confidence_level,
          positive_evidence_count = excluded.positive_evidence_count,
          negative_evidence_count = excluded.negative_evidence_count,
          supporting_evidence_count = excluded.supporting_evidence_count,
          source_breakdown = excluded.source_breakdown, last_recomputed_at = excluded.last_recomputed_at`;
    }
  }

  private async persistGutScore(
    sql: Sql,
    userId: string,
    score: { currentScore: number; baselineScore: number; phase: string; confidenceLevel: string; trendDelta7d: number; components: unknown; drivers: unknown },
    event: { eventType: string; scoreBefore?: number | null; scoreAfter: number; scoreDelta: number; phaseBefore?: string | null; phaseAfter?: string; summary?: string; drivers: unknown },
    sourceType: string,
    sourceId?: string,
  ) {
    const sid = sourceId ?? `recompute-${Date.now()}`;
    await sql`insert into public.gut_score_snapshots
      (user_id, score, baseline_score, phase, confidence_level, trend_delta_7d, components, drivers,
       score_algorithm_version, source_type, source_id)
      values (${userId}, ${score.currentScore}, ${score.baselineScore}, ${score.phase},
       ${score.confidenceLevel}, ${score.trendDelta7d}, ${sql.json(score.components as never)},
       ${sql.json(score.drivers as never)}, ${GUT_SCORE_ALGORITHM_VERSION}, ${sourceType}, ${sid})
      on conflict (user_id, source_type, source_id) do nothing`;
    await sql`insert into public.gut_score_events
      (user_id, event_type, source_type, source_id, score_before, score_after, score_delta,
       phase_before, phase_after, summary, drivers, score_algorithm_version)
      values (${userId}, ${event.eventType}, ${sourceType}, ${sid}, ${event.scoreBefore ?? null},
       ${event.scoreAfter}, ${event.scoreDelta}, ${event.phaseBefore ?? null}, ${event.phaseAfter ?? null},
       ${event.summary ?? null}, ${sql.json(event.drivers as never)}, ${GUT_SCORE_ALGORITHM_VERSION})
      on conflict (user_id, source_type, source_id) do nothing`;
  }
}

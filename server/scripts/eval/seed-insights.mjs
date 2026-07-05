// Seed / reset learned ingredient insights for the shared golden eval user so a
// case can assert on the PERSONAL-evidence path (bounded RAG influence +
// conditional adjudication).
//
// The eval runner authenticates as one long-lived user, so seeded insights MUST
// be isolated per expectation: seed exactly the requested set immediately before
// the scan, then reset to empty immediately after. Cases without a `seedInsights`
// key never touch the database (the default 65-case suite is byte-identical).
//
// Seeded rows mirror learning-recompute.service's ingredient_insights columns so
// insights.getInsights(userId) maps them back into a valid IngredientInsight.
// Semantics:
//   direction 'reactive' -> negative (reactive) days, high combined risk
//   direction 'calm'     -> positive (calm) days, low combined risk
// `days` is the distinct outcome-day count (defaults to a value that clears the
// medium/high confidence thresholds the adjudicator's clamp checks).
import postgres from 'postgres';

const DEFAULT_DAYS = 6;

function insightRow(userId, seed) {
  const days = Math.max(1, Number(seed.days ?? DEFAULT_DAYS));
  const reactive = seed.direction === 'reactive';
  const confidence = seed.confidence ?? 'high';
  const linkedConditions = seed.linkedConditions ?? [];
  return {
    user_id: userId,
    ingredient_name: seed.ingredient,
    trigger_score: reactive ? 72 : 8,
    safe_score: reactive ? 8 : 72,
    combined_risk_score: reactive ? 76 : 20,
    confidence_level: confidence,
    pattern_strength: reactive ? 'strong' : 'moderate',
    linked_conditions: JSON.stringify(linkedConditions),
    supporting_evidence_count: days,
    positive_evidence_count: reactive ? 0 : days,
    negative_evidence_count: reactive ? days : 0,
    last_seen_at: null,
    last_outcome_at: null,
    source_breakdown: JSON.stringify({
      declared: false,
      science: false,
      personal: true,
      positiveEvidenceCount: reactive ? 0 : days,
      negativeEvidenceCount: reactive ? days : 0,
    }),
    last_recomputed_at: new Date().toISOString(),
  };
}

/**
 * Replace the user's ingredient insights with exactly `seeds` (empty array
 * clears them). Uses the ADMIN connection (bypasses RLS) — local/CI only.
 */
export async function setEvalInsights(adminUrl, userId, seeds) {
  if (adminUrl.includes('api.mytummyhurts.app')) {
    throw new Error('refusing to seed insights against production');
  }
  const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`delete from public.ingredient_insights where user_id = ${userId}`;
    const rows = (seeds ?? []).map((seed) => insightRow(userId, seed));
    if (rows.length) {
      await sql`insert into public.ingredient_insights ${sql(
        rows,
        'user_id', 'ingredient_name', 'trigger_score', 'safe_score', 'combined_risk_score',
        'confidence_level', 'pattern_strength', 'linked_conditions', 'supporting_evidence_count',
        'positive_evidence_count', 'negative_evidence_count', 'last_seen_at', 'last_outcome_at',
        'source_breakdown', 'last_recomputed_at',
      )}`;
    }
  } finally {
    await sql.end();
  }
}

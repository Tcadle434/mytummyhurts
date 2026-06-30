// Ported verbatim from supabase/functions/_shared/scanAnalysis.ts — maps a
// ScanResult from the deterministic engine into the complete_reserved_scan_analysis
// payload, preserving every column mapping.
import type { ScanResult } from './engine/domain';
import type { ScanCompletionInput } from './scan-reservation.service';

function conditionRiskPayload(result: ScanResult) {
  return result.conditionRisks.map((risk) => ({
    condition_name: risk.conditionName,
    risk_score: risk.riskScore,
    risk_level: risk.riskLevel,
    reason: risk.reason,
    display_order: risk.displayOrder,
  }));
}

function ingredientRiskPayload(result: ScanResult) {
  return result.ingredientRisks.map((ingredient) => ({
    menu_item_source_id: ingredient.menuItemSourceId ?? null,
    raw_name: ingredient.rawName,
    canonical_name: ingredient.canonicalName,
    risk_score: ingredient.riskScore,
    risk_level: ingredient.riskLevel,
    evidence: ingredient.evidence,
    confidence: ingredient.confidence,
    component_name: ingredient.componentName ?? null,
    reason: ingredient.reason,
    display_order: ingredient.displayOrder,
  }));
}

function dietEvaluationPayload(
  evaluations: ScanResult['dietEvaluations'],
  menuItemSourceId?: string,
) {
  return evaluations.map((evaluation, index) => ({
    menu_item_source_id: menuItemSourceId ?? evaluation.menuItemSourceId ?? null,
    diet_key: evaluation.dietKey,
    diet_label: evaluation.dietLabel,
    status: evaluation.status,
    confidence: evaluation.confidence,
    reason: evaluation.reason,
    supporting_factors: evaluation.supportingFactors,
    conflicts: evaluation.conflicts,
    missing_info: evaluation.missingInfo,
    score_adjustment: evaluation.scoreAdjustment,
    model_status: evaluation.modelStatus ?? null,
    model_confidence: evaluation.modelConfidence ?? null,
    model_reason: evaluation.modelReason ?? null,
    accepted_model_status: evaluation.acceptedModelStatus,
    rubric_version: evaluation.rubricVersion,
    display_order: evaluation.displayOrder ?? index,
  }));
}

function analysisMetadata(result: ScanResult) {
  return {
    extractionModel: result.structuredAnalysis.model,
    extractionPromptVersion: result.structuredAnalysis.promptVersion,
    extractionClarity: result.structuredAnalysis.clarity,
    extractionUnclearReason: result.structuredAnalysis.unclearReason ?? null,
    dishConfidence: result.structuredAnalysis.dishConfidence,
    imageDetail: result.structuredAnalysis.imageDetail,
    prepStyle: result.structuredAnalysis.prepStyle,
    rubricVersion: result.rubricVersion ?? result.structuredAnalysis.rubricVersion ?? null,
    gutScoreImpact: result.gutScoreImpact ?? null,
    possibleTriggers: result.possibleTriggers ?? [],
    interpretation: result.interpretation ?? result.summary ?? null,
    evidenceCitations: (result as { evidenceCitations?: unknown[] }).evidenceCitations ?? [],
    // Full extraction so scan-get can return structuredAnalysis without re-running the model.
    structuredAnalysis: result.structuredAnalysis,
  };
}

/** Build the menu completion payload (port of menuResultPayload) — persists
 *  menu_items + per-item ingredient risks + per-item diet evaluations. */
export function buildMenuCompletionInput(
  userId: string,
  scanId: string,
  result: ScanResult,
): ScanCompletionInput {
  const menu = result.menuResult as
    | {
        menuTitle?: string;
        summary?: string;
        items?: MenuItemLike[];
        bestForYou?: MenuItemLike[];
        eatWithCaution?: MenuItemLike[];
        tryToAvoid?: MenuItemLike[];
      }
    | undefined;
  const items: MenuItemLike[] = menu?.items?.length
    ? menu.items
    : [...(menu?.bestForYou ?? []), ...(menu?.eatWithCaution ?? []), ...(menu?.tryToAvoid ?? [])];

  const menuItems = items.map((item) => ({
    source_item_id: item.sourceItemId,
    tier: item.tier,
    tier_rank: item.tierRank,
    display_order: item.displayOrder ?? item.tierRank ?? 0,
    name: item.name,
    description: item.description ?? null,
    section: item.section ?? null,
    price: item.price ?? null,
    risk_score: item.riskScore,
    risk_level: item.riskLevel,
    confidence: item.confidence ?? item.scoringConfidence ?? 'medium',
    scoring_confidence: item.scoringConfidence ?? 'medium',
    base_food_category: item.baseFoodCategory ?? null,
    risk_modifiers: item.riskModifiers ?? [],
    score_contributors: item.scoreContributors ?? [],
    why_this_score: item.whyThisScore ?? '',
    gut_recommendation: item.gutRecommendation ?? null,
  }));

  const ingredientRisks = items.flatMap((item) =>
    (item.ingredientRisks ?? []).map((ing) => ({
      menu_item_source_id: item.sourceItemId,
      raw_name: ing.rawName,
      canonical_name: ing.canonicalName,
      risk_score: ing.riskScore,
      risk_level: ing.riskLevel,
      evidence: ing.evidence,
      confidence: ing.confidence,
      component_name: ing.componentName ?? item.name,
      reason: ing.reason,
      display_order: ing.displayOrder,
    })),
  );

  const dietEvaluations = items.flatMap((item) =>
    dietEvaluationPayload(item.dietEvaluations ?? [], item.sourceItemId),
  );

  return {
    userId,
    scanId,
    title: menu?.menuTitle ?? result.dishName,
    overallRiskScore: result.overallRiskScore,
    overallRiskLevel: result.overallRiskLevel,
    pipTake: result.pipTake ?? result.interpretation ?? null,
    summary: menu?.summary ?? result.summary ?? null,
    baseFoodCategory: result.baseFoodCategory ?? null,
    riskModifiers: result.riskModifiers ?? [],
    scoreContributors: result.scoreContributors ?? [],
    scoringConfidence: result.scoringConfidence ?? null,
    gutRecommendation: result.gutRecommendation ?? null,
    rubricVersion: result.rubricVersion ?? null,
    conditionRisks: conditionRiskPayload(result),
    ingredientRisks,
    dietEvaluations,
    menuItems,
    groceryProduct: null,
    inputRefs: [],
    analysisMetadata: analysisMetadata(result),
    gutScoreImpact: result.gutScoreImpact ?? null,
  };
}

interface MenuItemLike {
  sourceItemId: string;
  tier: string;
  tierRank: number;
  displayOrder?: number;
  name: string;
  description?: string;
  section?: string;
  price?: string;
  riskScore: number;
  riskLevel: string;
  confidence?: string;
  scoringConfidence?: string;
  baseFoodCategory?: unknown;
  riskModifiers?: unknown[];
  scoreContributors?: unknown[];
  whyThisScore?: string;
  gutRecommendation?: string;
  ingredientRisks?: Array<ScanResult['ingredientRisks'][number] & { menuItemSourceId?: string }>;
  dietEvaluations?: ScanResult['dietEvaluations'];
}

/** Build the food/single-scan completion payload from an engine ScanResult. */
export function buildFoodCompletionInput(
  userId: string,
  scanId: string,
  result: ScanResult,
  inputRefs: unknown[] = [],
): ScanCompletionInput {
  return {
    userId,
    scanId,
    title: result.dishName,
    overallRiskScore: result.overallRiskScore,
    overallRiskLevel: result.overallRiskLevel,
    pipTake: result.pipTake ?? result.interpretation ?? null,
    summary: result.summary ?? result.interpretation ?? null,
    baseFoodCategory: result.baseFoodCategory ?? null,
    riskModifiers: result.riskModifiers ?? [],
    scoreContributors: result.scoreContributors ?? [],
    scoringConfidence: result.scoringConfidence ?? null,
    gutRecommendation: result.gutRecommendation ?? null,
    rubricVersion: result.rubricVersion ?? null,
    conditionRisks: conditionRiskPayload(result),
    ingredientRisks: ingredientRiskPayload(result),
    dietEvaluations: dietEvaluationPayload(result.dietEvaluations),
    menuItems: [],
    groceryProduct: null,
    inputRefs,
    analysisMetadata: analysisMetadata(result),
    gutScoreImpact: result.gutScoreImpact ?? null,
  };
}

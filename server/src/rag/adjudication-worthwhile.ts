// Conditional adjudication gate (spec Step 3).
//
// The LLM risk-adjudication call is a second hot-path model round-trip. It only
// earns its cost when there is real evidence for the judgment layer to weigh:
//   (a) a learned insight with paired evidence (hasPairedEvidence) that matches
//       an extracted ingredient — the user has personal history on the plate, OR
//   (b) at least one matched, non-neutral RAG chunk — real literature to cite.
// Cold-start users (no insights, no matched literature) skip the call entirely
// and keep the fast path; their score still comes from extraction bands +
// deterministic placement.
//
// Pure: mirrors exactly what the adjudicator would receive, so "worthwhile"
// never disagrees with "the adjudicator actually had something to use".
import type { IngredientInsight, StructuredAnalysisV2 } from '../scan/engine/domain';
import { buildPersonalRiskEvidence } from '../scan/engine/riskAdjudication';
import { hasPairedEvidence } from '@mth/shared-domain';

import type { RagSignal } from './rag-influence';

/** True when at least one matched RAG signal carries a non-neutral direction. */
function hasMatchedDirectionalLiterature(ragSignals: RagSignal[]): boolean {
  return ragSignals.some((signal) => signal.direction === 'raises' || signal.direction === 'lowers');
}

/**
 * True when an insight with real paired evidence maps onto an ingredient in the
 * dish. buildPersonalRiskEvidence is the same matcher the adjudication request
 * uses (canonical/raw names + aliases, supportingEvidenceCount > 0), so this
 * predicate agrees with what the LLM would actually be handed; the paired-evidence
 * filter additionally excludes exposure-only "watching" rows.
 */
function hasPersonalEvidenceOnPlate(
  extraction: StructuredAnalysisV2,
  insights: IngredientInsight[],
): boolean {
  const evidenceBacked = insights.filter(hasPairedEvidence);
  if (!evidenceBacked.length) return false;
  return buildPersonalRiskEvidence(extraction, evidenceBacked).length > 0;
}

/**
 * Decide whether to run the LLM risk adjudication for this scan. Returns false
 * for cold-start scans so they keep the single-call fast path.
 */
export function adjudicationWorthwhile(
  insights: IngredientInsight[],
  extraction: StructuredAnalysisV2,
  ragSignals: RagSignal[],
): boolean {
  return hasPersonalEvidenceOnPlate(extraction, insights) || hasMatchedDirectionalLiterature(ragSignals);
}

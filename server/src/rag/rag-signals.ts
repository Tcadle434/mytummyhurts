// Turn retrieved evidence chunks into bounded RAG influence signals.
//
// The trust guarantee lives here: a chunk only becomes a signal when one of its
// ingredientTags actually appears among the dish's extracted ingredients. A
// plain-rice scan therefore never yields a dairy/garlic citation, no matter what
// the retriever surfaced — citations "vary by dish" and survive scrutiny because
// they are literally filtered to what is on the plate.
//
// This module is pure: no I/O, no config. It reuses mechanismScoring's
// word-boundary term-matching style (normalize -> space-padded substring) so an
// ingredient's canonical/raw name matches a tag the same way the scorer matches
// mechanism terms.
import type { StructuredAnalysisV2 } from '../scan/engine/domain';
import { normalize } from '../scan/engine/text-utils';

import type { ChunkDirection, Confidence, RagSignal } from './rag-influence';
import type { RiskAdjudicationEvidenceChunk } from '../scan/engine/riskAdjudication';

// Relevance -> confidence tiers (spec Step 2.1). Kept small and explicit so the
// mapping is obvious at the call site and in tests.
const CONFIDENCE_HIGH_MIN = 0.5;
const CONFIDENCE_MEDIUM_MIN = 0.3;

function confidenceForRelevance(relevance: number): Confidence {
  if (relevance >= CONFIDENCE_HIGH_MIN) return 'high';
  if (relevance >= CONFIDENCE_MEDIUM_MIN) return 'medium';
  return 'low';
}

// A chunk with no explicit direction contributes nothing to the delta but may
// still be a citation; computeRagAdjustment maps 'neutral' to sign 0.
function chunkDirection(direction: RiskAdjudicationEvidenceChunk['direction']): ChunkDirection {
  return direction === 'raises' || direction === 'lowers' ? direction : 'neutral';
}

/** Distinct normalized ingredient terms (canonical + raw) for the dish. */
function extractedIngredientTerms(extraction: StructuredAnalysisV2): string[] {
  return Array.from(
    new Set(
      [...extraction.visibleIngredients, ...extraction.inferredIngredients]
        .flatMap((ingredient) => [ingredient.canonicalName, ingredient.rawName])
        .map((value) => normalize(value))
        .filter(Boolean),
    ),
  );
}

// Word-boundary term match, mirroring mechanismScoring.textHasTerm: pad both
// sides so "rice" matches "white rice" but not "price". Falls back to a
// containment check for multi-word tags where either side subsumes the other
// (e.g. tag "deli meat" vs ingredient "meat"), matching the scorer's namesMatch
// leniency without pulling in the full alias table.
function termMatchesIngredient(term: string, ingredient: string): boolean {
  if (!term || !ingredient) return false;
  if (` ${ingredient} `.includes(` ${term} `)) return true;
  if (` ${term} `.includes(` ${ingredient} `)) return true;
  return false;
}

/**
 * Build the bounded-influence signals for a scan. For each evidence chunk, find
 * the first extracted ingredient that matches one of the chunk's ingredientTags.
 * No match -> the chunk is dropped (never cited, never scored). The matched
 * ingredient is recorded so the citation can name why it appears.
 */
export function buildRagSignals(
  extraction: StructuredAnalysisV2,
  ragEvidence: RiskAdjudicationEvidenceChunk[],
): RagSignal[] {
  const ingredientTerms = extractedIngredientTerms(extraction);
  if (!ingredientTerms.length) return [];

  const signals: RagSignal[] = [];
  for (const chunk of ragEvidence) {
    const tags = (chunk.ingredientTags ?? []).map((tag) => normalize(tag)).filter(Boolean);
    if (!tags.length) continue;

    let matchedIngredient: string | undefined;
    for (const ingredient of ingredientTerms) {
      if (tags.some((tag) => termMatchesIngredient(tag, ingredient))) {
        matchedIngredient = ingredient;
        break;
      }
    }
    if (!matchedIngredient) continue;

    signals.push({
      chunkId: chunk.chunkId,
      source: chunk.source,
      title: chunk.title,
      direction: chunkDirection(chunk.direction),
      relevance: chunk.relevanceScore,
      confidence: confidenceForRelevance(chunk.relevanceScore),
      matchedIngredient,
    });
  }
  return signals;
}

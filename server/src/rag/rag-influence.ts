// Bounded RAG → score influence. The deterministic engine owns the base score;
// retrieved evidence may only nudge it by a small, hard-clamped amount that can
// NEVER cross a risk-band boundary on its own. Authoritative bands (engine):
// low < 37, medium 37–63, high >= 64.
const LOW_BAND_MAX = 36;
const MEDIUM_BAND_MAX = 63;

export type ChunkDirection = 'raises' | 'lowers' | 'neutral';
export type Confidence = 'low' | 'medium' | 'high';

export interface RagSignal {
  chunkId: string;
  source: string;
  title: string;
  direction: ChunkDirection;
  relevance: number; // 0..1 (reranker score)
  confidence: Confidence;
  matchedIngredient: string;
}

export interface RagAdjustment {
  applied: boolean;
  baseScore: number;
  rawDelta: number;
  clampedDelta: number;
  maxDelta: number;
  bandGuardApplied: boolean;
  finalScore: number;
  reason: string;
  citations: Array<Pick<RagSignal, 'chunkId' | 'source' | 'title' | 'direction' | 'relevance' | 'matchedIngredient'>>;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.3 };

export interface RagInfluenceOptions {
  enabled: boolean;
  maxDelta: number; // e.g. 5
}

/**
 * Compute a bounded adjustment. `signals` should already be filtered to chunks
 * whose ingredient actually appears in the scan result (enforced upstream) — this
 * is what guarantees "no invented ingredients".
 */
export function computeRagAdjustment(
  baseScore: number,
  signals: RagSignal[],
  opts: RagInfluenceOptions,
): RagAdjustment {
  const passthrough = (reason: string): RagAdjustment => ({
    applied: false,
    baseScore,
    rawDelta: 0,
    clampedDelta: 0,
    maxDelta: opts.maxDelta,
    bandGuardApplied: false,
    finalScore: baseScore,
    reason,
    citations: [],
  });

  if (!opts.enabled) return passthrough('rag_influence_disabled');
  if (signals.length === 0) return passthrough('no_matching_evidence');

  const sum = signals.reduce((acc, s) => {
    const sign = s.direction === 'raises' ? 1 : s.direction === 'lowers' ? -1 : 0;
    return acc + sign * s.relevance * CONFIDENCE_WEIGHT[s.confidence];
  }, 0);

  // tanh keeps the unclamped signal smooth and within (−maxDelta, +maxDelta).
  const rawDelta = opts.maxDelta * Math.tanh(sum);
  let finalScore = baseScore + Math.round(Math.max(-opts.maxDelta, Math.min(opts.maxDelta, rawDelta)));
  let bandGuardApplied = false;

  // Band-cross guard: RAG alone may nudge only within the base score's band.
  // It cannot promote a LOW result to MEDIUM/HIGH or reassure a HIGH result down
  // into MEDIUM/LOW.
  const band =
    baseScore <= LOW_BAND_MAX
      ? { min: 0, max: LOW_BAND_MAX }
      : baseScore <= MEDIUM_BAND_MAX
        ? { min: LOW_BAND_MAX + 1, max: MEDIUM_BAND_MAX }
        : { min: MEDIUM_BAND_MAX + 1, max: 100 };
  if (finalScore < band.min) {
    finalScore = band.min;
    bandGuardApplied = true;
  }
  if (finalScore > band.max) {
    finalScore = band.max;
    bandGuardApplied = true;
  }
  finalScore = Math.max(0, Math.min(100, finalScore));

  const directionCounts = signals.filter((s) => s.direction === 'raises').length;
  return {
    applied: true,
    baseScore,
    rawDelta,
    clampedDelta: finalScore - baseScore,
    maxDelta: opts.maxDelta,
    bandGuardApplied,
    finalScore,
    reason:
      directionCounts >= signals.length / 2
        ? `${directionCounts} source(s) corroborate elevated risk`
        : `evidence leans reassuring`,
    citations: signals.map((s) => ({
      chunkId: s.chunkId,
      source: s.source,
      title: s.title,
      direction: s.direction,
      relevance: s.relevance,
      matchedIngredient: s.matchedIngredient,
    })),
  };
}

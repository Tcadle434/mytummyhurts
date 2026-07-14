import { hasPairedEvidence } from '@mth/shared-domain';

import type { IngredientInsight } from '../engine/domain';
import type { ConcernPersonalEvidence, ConcernSubject } from './domain';

function normalize(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matches(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

export function buildConcernPersonalEvidence(
  subjects: ConcernSubject[],
  insights: IngredientInsight[],
): ConcernPersonalEvidence[] {
  const facts = subjects.flatMap((subject) => subject.facts);
  return insights
    .filter(hasPairedEvidence)
    .map((insight): ConcernPersonalEvidence | null => {
      const matchedFactIds = facts
        .filter((fact) => matches(fact.canonicalName, insight.ingredientName) || matches(fact.rawName, insight.ingredientName))
        .map((fact) => fact.id);
      if (!matchedFactIds.length) return null;
      return {
        id: `personal:${insight.id}`,
        ingredientName: insight.ingredientName,
        matchedFactIds,
        confidence: insight.confidenceLevel,
        calmEvidenceCount: insight.positiveEvidenceCount,
        reactiveEvidenceCount: insight.negativeEvidenceCount,
        summary: insight.summary,
      };
    })
    .filter((entry): entry is ConcernPersonalEvidence => entry !== null)
    .slice(0, 20);
}

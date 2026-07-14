import type {
  ConcernConditionContext,
  ConcernEvidenceClaim,
  ConcernMechanismMap,
  SupportedConditionKey,
} from './domain';

const STRENGTH_ORDER = { high: 0, moderate: 1, limited: 2 } as const;

function claimKey(claim: ConcernEvidenceClaim) {
  return `${claim.source.url}|${claim.summary.trim().toLowerCase()}`;
}

export function retrieveConcernEvidence(input: {
  claims: ConcernEvidenceClaim[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
}): ConcernEvidenceClaim[] {
  const conditionKeys = new Set<SupportedConditionKey>(input.conditions.map((condition) => condition.key));
  const mechanisms = new Set(
    input.mechanismMaps.flatMap((map) => map.exposures.map((exposure) => exposure.mechanismKey)),
  );
  const seen = new Set<string>();
  return input.claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => claim.conditions.some((condition) => conditionKeys.has(condition)))
    .filter(({ claim }) => claim.mechanisms.some((mechanism) => mechanisms.has(mechanism)))
    .sort((left, right) => {
      const strength = STRENGTH_ORDER[left.claim.strength] - STRENGTH_ORDER[right.claim.strength];
      return strength || left.index - right.index;
    })
    .map(({ claim }) => claim)
    .filter((claim) => {
      const key = claimKey(claim);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function claimsForConditionAndMechanisms(
  claims: ConcernEvidenceClaim[],
  condition: SupportedConditionKey,
  mechanisms: readonly string[],
) {
  const mechanismSet = new Set(mechanisms);
  return claims.filter(
    (claim) => claim.conditions.includes(condition)
      && claim.mechanisms.some((mechanism) => mechanismSet.has(mechanism)),
  );
}

import {
  CONDITION_BAND_ORDER,
  CONDITION_BAND_RANGES,
  conditionBandForScore,
} from '@mth/shared-domain';

import type {
  ConcernBandPosition,
  ConcernConditionContext,
  ConcernConditionDecision,
  ConcernSubject,
  ConcernSubjectResult,
  ConcernSubjectVerification,
} from './domain';
import type { IngredientConfidence } from '../engine/domain';
import { concernConditionLabel } from './profile';

const POSITION_VALUE: Record<ConcernBandPosition, 'min' | 'mid' | 'max'> = {
  lower: 'min',
  middle: 'mid',
  upper: 'max',
};

const CONFIDENCE_ORDER: Record<IngredientConfidence, number> = { low: 0, medium: 1, high: 2 };

function scoreForBand(band: (typeof CONDITION_BAND_ORDER)[number], position: ConcernBandPosition) {
  return Math.round(CONDITION_BAND_RANGES[band][POSITION_VALUE[position]]);
}

function lowerConfidence(left: IngredientConfidence, right: IngredientConfidence) {
  return CONFIDENCE_ORDER[left] <= CONFIDENCE_ORDER[right] ? left : right;
}

export function finalizeConcernSubject(input: {
  subject: ConcernSubject;
  conditionContexts: ConcernConditionContext[];
  decisions: ConcernConditionDecision[];
  verification: ConcernSubjectVerification;
}): ConcernSubjectResult {
  const decisionByCondition = new Map(input.decisions.map((decision) => [decision.conditionKey, decision]));
  const verificationByCondition = new Map(
    input.verification.conditions.map((verification) => [verification.conditionKey, verification]),
  );
  const conditions = input.conditionContexts.map((condition) => {
    const decision = decisionByCondition.get(condition.key);
    const verification = verificationByCondition.get(condition.key);
    if (!decision || !verification) throw new Error(`concern_v1_missing_condition:${condition.key}`);
    const score = scoreForBand(verification.verifiedBand, verification.verifiedPosition);
    return {
      conditionKey: condition.key,
      conditionLabel: concernConditionLabel(condition.key),
      score,
      band: conditionBandForScore(score),
      confidence: lowerConfidence(decision.confidence, verification.confidence),
      verificationStatus: verification.status,
      mechanisms: verification.validMechanismKeys,
      sourceFactIds: verification.validSourceFactIds,
      claimIds: verification.validClaimIds,
      personalEvidenceIds: verification.validPersonalEvidenceIds,
      rationale: verification.reason,
      action: verification.action,
    };
  });
  const driving = [...conditions].sort((left, right) => right.score - left.score)[0];
  if (!driving) throw new Error('concern_v1_no_condition_results');
  return {
    subjectId: input.subject.id,
    subjectName: input.subject.name,
    score: driving.score,
    band: driving.band,
    confidence: driving.confidence,
    drivingConditionKey: driving.conditionKey,
    drivingConditionLabel: driving.conditionLabel,
    conditions,
  };
}

export function bandIndex(band: (typeof CONDITION_BAND_ORDER)[number]) {
  return CONDITION_BAND_ORDER.indexOf(band);
}

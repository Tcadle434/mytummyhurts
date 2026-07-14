import { CONDITION_BAND_ORDER } from '@mth/shared-domain';
import { z } from 'zod';

import { defineStructuredOutput } from '../../llm/structured-output';
import {
  CONCERN_MECHANISM_KEYS,
  SUPPORTED_CONDITION_KEYS,
  type ConcernConditionContext,
  type ConcernEvidenceClaim,
  type ConcernMechanismMap,
  type ConcernPersonalEvidence,
  type ConcernSubject,
  type ConcernSubjectDecision,
} from './domain';
import { bandIndex } from './scoring';

const nonblank = z.string().trim().min(1);
const confidenceSchema = z.enum(['low', 'medium', 'high']);
const amountSchema = z.enum(['trace', 'small', 'standard', 'large', 'dominant']);
const bandSchema = z.enum([...CONDITION_BAND_ORDER] as [
  (typeof CONDITION_BAND_ORDER)[number],
  ...(typeof CONDITION_BAND_ORDER)[number][],
]);
const positionSchema = z.enum(['lower', 'middle', 'upper']);
const mechanismKeySchema = z.enum(CONCERN_MECHANISM_KEYS);
const conditionKeySchema = z.enum(SUPPORTED_CONDITION_KEYS);

const mechanismExposureSchema = z.object({
  mechanismKey: mechanismKeySchema,
  sourceFactIds: z.array(nonblank).min(1),
  sourceLabel: nonblank,
  amount: amountSchema,
  confidence: confidenceSchema,
  basis: nonblank,
}).strict();

const mechanismMapSchema = z.object({
  subjectId: nonblank,
  exposures: z.array(mechanismExposureSchema),
  unresolvedFacts: z.array(z.string()),
}).strict();

const mechanismMappingPayloadSchema = z.object({
  subjects: z.array(mechanismMapSchema),
}).strict();

function exactSet(actual: readonly string[], expected: ReadonlySet<string>) {
  return actual.length === expected.size
    && new Set(actual).size === actual.length
    && actual.every((value) => expected.has(value));
}

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

export function concernMechanismMappingOutput(subjects: ConcernSubject[]) {
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  const factIds = new Map(subjects.map((subject) => [subject.id, new Set(subject.facts.map((fact) => fact.id))]));
  const schema = mechanismMappingPayloadSchema.superRefine((payload, context) => {
    if (!exactSet(payload.subjects.map((subject) => subject.subjectId), subjectIds)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjects'],
        message: 'Must return exactly one mechanism map for every requested subject.',
      });
    }
    payload.subjects.forEach((subject, subjectIndex) => {
      const allowedFacts = factIds.get(subject.subjectId);
      if (!allowedFacts) return;
      const seen = new Set<string>();
      subject.exposures.forEach((exposure, exposureIndex) => {
        if (hasDuplicates(exposure.sourceFactIds)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subjects', subjectIndex, 'exposures', exposureIndex, 'sourceFactIds'],
            message: 'Mechanism source identifiers must be unique.',
          });
        }
        if (exposure.sourceFactIds.some((id) => !allowedFacts.has(id))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subjects', subjectIndex, 'exposures', exposureIndex, 'sourceFactIds'],
            message: 'Mechanism sources must reference supplied food fact identifiers.',
          });
        }
        const key = `${exposure.mechanismKey}:${[...exposure.sourceFactIds].sort().join(',')}`;
        if (seen.has(key)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['subjects', subjectIndex, 'exposures', exposureIndex],
            message: 'Duplicate mechanism exposures are not allowed.',
          });
        }
        seen.add(key);
      });
    });
  });
  return defineStructuredOutput('concern_v1_mechanism_mapping', schema);
}

const conditionDecisionSchema = z.object({
  conditionKey: conditionKeySchema,
  genericBand: bandSchema,
  personalizedBand: bandSchema,
  position: positionSchema,
  confidence: confidenceSchema,
  mechanismKeys: z.array(mechanismKeySchema),
  sourceFactIds: z.array(nonblank),
  claimIds: z.array(nonblank),
  personalEvidenceIds: z.array(nonblank),
  rationale: nonblank,
  action: nonblank,
}).strict();

const subjectDecisionSchema = z.object({
  subjectId: nonblank,
  conditions: z.array(conditionDecisionSchema),
}).strict();

const adjudicationPayloadSchema = z.object({
  subjects: z.array(subjectDecisionSchema),
}).strict();

function allowedPersonalBandMove(ids: readonly string[], evidence: ConcernPersonalEvidence[]) {
  const selected = evidence.filter((entry) => ids.includes(entry.id));
  return selected.some((entry) => entry.confidence === 'medium' || entry.confidence === 'high') ? 1 : 0;
}

export function concernAdjudicationOutput(input: {
  subjects: ConcernSubject[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
  claims: ConcernEvidenceClaim[];
  personalEvidence: ConcernPersonalEvidence[];
}) {
  const subjectIds = new Set(input.subjects.map((subject) => subject.id));
  const conditionKeys = new Set(input.conditions.map((condition) => condition.key));
  const factsBySubject = new Map(input.subjects.map((subject) => [subject.id, new Set(subject.facts.map((fact) => fact.id))]));
  const mapsBySubject = new Map(input.mechanismMaps.map((map) => [map.subjectId, map]));
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const personalById = new Map(input.personalEvidence.map((entry) => [entry.id, entry]));

  const schema = adjudicationPayloadSchema.superRefine((payload, context) => {
    if (!exactSet(payload.subjects.map((subject) => subject.subjectId), subjectIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['subjects'], message: 'Must return every requested subject exactly once.' });
    }
    payload.subjects.forEach((subject, subjectIndex) => {
      if (!exactSet(subject.conditions.map((condition) => condition.conditionKey), conditionKeys)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subjects', subjectIndex, 'conditions'],
          message: 'Must return every requested condition exactly once.',
        });
      }
      const allowedFacts = factsBySubject.get(subject.subjectId) ?? new Set<string>();
      const mechanismMap = mapsBySubject.get(subject.subjectId);
      const allowedMechanisms = new Set(mechanismMap?.exposures.map((exposure) => exposure.mechanismKey) ?? []);
      subject.conditions.forEach((decision, conditionIndex) => {
        const path = ['subjects', subjectIndex, 'conditions', conditionIndex] as (string | number)[];
        for (const [field, values] of [
          ['mechanismKeys', decision.mechanismKeys],
          ['sourceFactIds', decision.sourceFactIds],
          ['claimIds', decision.claimIds],
          ['personalEvidenceIds', decision.personalEvidenceIds],
        ] as const) {
          if (hasDuplicates(values)) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, field], message: 'Duplicate identifiers are not allowed.' });
          }
        }
        if (decision.mechanismKeys.some((key) => !allowedMechanisms.has(key))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'mechanismKeys'], message: 'Decision mechanisms must come from the mechanism map.' });
        }
        if (decision.sourceFactIds.some((id) => !allowedFacts.has(id))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'sourceFactIds'], message: 'Decision sources must reference supplied food facts.' });
        }
        const selectedMechanismFacts = new Map(decision.mechanismKeys.map((key) => [
          key,
          new Set(
            mechanismMap?.exposures
              .filter((exposure) => exposure.mechanismKey === key)
              .flatMap((exposure) => exposure.sourceFactIds) ?? [],
          ),
        ]));
        const mappedSourceFacts = new Set([...selectedMechanismFacts.values()].flatMap((ids) => [...ids]));
        if (decision.sourceFactIds.some((id) => !mappedSourceFacts.has(id))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'sourceFactIds'], message: 'Decision sources must support a selected mechanism.' });
        }
        if ([...selectedMechanismFacts.values()].some((ids) => !decision.sourceFactIds.some((id) => ids.has(id)))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'sourceFactIds'], message: 'Every selected mechanism requires a cited source fact.' });
        }
        const invalidClaim = decision.claimIds.some((id) => {
          const claim = claimsById.get(id);
          return !claim
            || !claim.conditions.includes(decision.conditionKey)
            || !claim.mechanisms.some((mechanism) => decision.mechanismKeys.includes(mechanism));
        });
        if (invalidClaim) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'claimIds'], message: 'Citations must support the selected condition and mechanism.' });
        }
        const selectedClaims = decision.claimIds
          .map((id) => claimsById.get(id))
          .filter((claim): claim is ConcernEvidenceClaim => Boolean(claim));
        if (decision.mechanismKeys.some((mechanism) => !selectedClaims.some(
          (claim) => claim.conditions.includes(decision.conditionKey) && claim.mechanisms.includes(mechanism),
        ))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'claimIds'], message: 'Every selected mechanism requires a condition-scoped evidence claim.' });
        }
        const invalidPersonal = decision.personalEvidenceIds.some((id) => {
          const evidence = personalById.get(id);
          return !evidence || !evidence.matchedFactIds.some((factId) => decision.sourceFactIds.includes(factId));
        });
        if (invalidPersonal) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'personalEvidenceIds'], message: 'Personal evidence must match a selected food fact.' });
        }
        const requiresSupport = ['moderate', 'high', 'severe'].includes(decision.genericBand)
          || ['moderate', 'high', 'severe'].includes(decision.personalizedBand);
        if (requiresSupport && (!decision.mechanismKeys.length || !decision.sourceFactIds.length || !decision.claimIds.length)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Moderate or higher concern requires facts, mechanisms, and supporting evidence.' });
        }
        if (decision.genericBand !== 'none' && !decision.mechanismKeys.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'mechanismKeys'], message: 'Non-none concern requires a mapped mechanism.' });
        }
        if ((decision.genericBand !== 'none' || decision.personalizedBand !== 'none') && !decision.claimIds.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'claimIds'], message: 'Non-none concern requires condition-scoped evidence.' });
        }
        if (requiresSupport && !selectedClaims.some((claim) => claim.direction === 'raises')) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'claimIds'], message: 'Moderate or higher concern requires evidence that supports increased caution.' });
        }
        if (decision.genericBand === 'none' && decision.personalizedBand === 'none'
          && (decision.mechanismKeys.length || decision.sourceFactIds.length || decision.claimIds.length || decision.personalEvidenceIds.length)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'A none decision cannot retain scoring drivers.' });
        }
        const allowedMove = allowedPersonalBandMove(decision.personalEvidenceIds, input.personalEvidence);
        const personalMove = bandIndex(decision.personalizedBand) - bandIndex(decision.genericBand);
        if (Math.abs(personalMove) > allowedMove) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'personalizedBand'], message: 'Personal evidence does not support this band movement.' });
        }
        const selectedPersonal = decision.personalEvidenceIds
          .map((id) => personalById.get(id))
          .filter((entry): entry is ConcernPersonalEvidence => Boolean(entry));
        const calm = selectedPersonal.reduce((sum, entry) => sum + entry.calmEvidenceCount, 0);
        const reactive = selectedPersonal.reduce((sum, entry) => sum + entry.reactiveEvidenceCount, 0);
        if (personalMove > 0 && reactive <= calm) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'personalizedBand'], message: 'A higher personalized band requires stronger reactive evidence.' });
        }
        if (personalMove < 0 && calm <= reactive) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'personalizedBand'], message: 'A lower personalized band requires stronger calm evidence.' });
        }
      });
    });
  });
  return defineStructuredOutput('concern_v1_adjudication', schema);
}

const verificationSchema = z.object({
  conditionKey: conditionKeySchema,
  status: z.enum(['accepted', 'lowered', 'uncertain']),
  verifiedBand: bandSchema,
  verifiedPosition: positionSchema,
  confidence: confidenceSchema,
  validMechanismKeys: z.array(mechanismKeySchema),
  validSourceFactIds: z.array(nonblank),
  validClaimIds: z.array(nonblank),
  validPersonalEvidenceIds: z.array(nonblank),
  reason: nonblank,
  action: nonblank,
}).strict();

const subjectVerificationSchema = z.object({
  subjectId: nonblank,
  conditions: z.array(verificationSchema),
}).strict();

const verificationPayloadSchema = z.object({
  subjects: z.array(subjectVerificationSchema),
}).strict();

const POSITION_ORDER = { lower: 0, middle: 1, upper: 2 } as const;

function decisionValue(decision: { personalizedBand: (typeof CONDITION_BAND_ORDER)[number]; position: 'lower' | 'middle' | 'upper' }) {
  return bandIndex(decision.personalizedBand) * 3 + POSITION_ORDER[decision.position];
}

function verificationValue(verification: { verifiedBand: (typeof CONDITION_BAND_ORDER)[number]; verifiedPosition: 'lower' | 'middle' | 'upper' }) {
  return bandIndex(verification.verifiedBand) * 3 + POSITION_ORDER[verification.verifiedPosition];
}

export function concernVerificationOutput(input: {
  decisions: ConcernSubjectDecision[];
  claims: ConcernEvidenceClaim[];
}) {
  const subjectIds = new Set(input.decisions.map((subject) => subject.subjectId));
  const decisionBySubject = new Map(input.decisions.map((subject) => [subject.subjectId, subject]));
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const schema = verificationPayloadSchema.superRefine((payload, context) => {
    if (!exactSet(payload.subjects.map((subject) => subject.subjectId), subjectIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['subjects'], message: 'Must verify every requested subject exactly once.' });
    }
    payload.subjects.forEach((subject, subjectIndex) => {
      const proposed = decisionBySubject.get(subject.subjectId)?.conditions ?? [];
      const conditionKeys = new Set(proposed.map((decision) => decision.conditionKey));
      if (!exactSet(subject.conditions.map((condition) => condition.conditionKey), conditionKeys)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['subjects', subjectIndex, 'conditions'], message: 'Must verify every proposed condition exactly once.' });
      }
      subject.conditions.forEach((verification, conditionIndex) => {
        const decision = proposed.find((entry) => entry.conditionKey === verification.conditionKey);
        if (!decision) return;
        const path = ['subjects', subjectIndex, 'conditions', conditionIndex] as (string | number)[];
        if (
          hasDuplicates(verification.validMechanismKeys)
          || hasDuplicates(verification.validSourceFactIds)
          || hasDuplicates(verification.validClaimIds)
          || hasDuplicates(verification.validPersonalEvidenceIds)
        ) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Duplicate verified identifiers are not allowed.' });
        }
        const proposedValue = decisionValue(decision);
        const verifiedValue = verificationValue(verification);
        if (verifiedValue > proposedValue) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'verifiedBand'], message: 'The verifier may not raise concern.' });
        }
        if (verification.status === 'accepted' && verifiedValue !== proposedValue) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'status'], message: 'Accepted decisions must preserve the proposed band and position.' });
        }
        if (verification.status === 'lowered' && verifiedValue >= proposedValue) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'status'], message: 'Lowered decisions must reduce concern.' });
        }
        if (verification.status === 'uncertain' && verification.confidence !== 'low') {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'confidence'], message: 'Uncertain verification must have low confidence.' });
        }
        if (verification.validMechanismKeys.some((key) => !decision.mechanismKeys.includes(key))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validMechanismKeys'], message: 'The verifier may not introduce mechanisms.' });
        }
        if (verification.validSourceFactIds.some((id) => !decision.sourceFactIds.includes(id))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validSourceFactIds'], message: 'The verifier may not introduce source facts.' });
        }
        if (verification.validClaimIds.some((id) => !decision.claimIds.includes(id))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validClaimIds'], message: 'The verifier may not introduce citations.' });
        }
        if (verification.validPersonalEvidenceIds.some((id) => !decision.personalEvidenceIds.includes(id))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validPersonalEvidenceIds'], message: 'The verifier may not introduce personal evidence.' });
        }
        if (verification.verifiedBand !== 'none' && !verification.validMechanismKeys.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validMechanismKeys'], message: 'Non-none verified concern requires a supported mechanism.' });
        }
        if (verification.verifiedBand !== 'none' && !verification.validSourceFactIds.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validSourceFactIds'], message: 'Non-none verified concern requires a source fact.' });
        }
        if (verification.verifiedBand !== 'none' && !verification.validClaimIds.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validClaimIds'], message: 'Non-none verified concern requires evidence.' });
        }
        const verifiedClaims = verification.validClaimIds
          .map((id) => claimsById.get(id))
          .filter((claim): claim is ConcernEvidenceClaim => Boolean(claim));
        if (verification.validMechanismKeys.some((mechanism) => !verifiedClaims.some(
          (claim) => claim.conditions.includes(verification.conditionKey) && claim.mechanisms.includes(mechanism),
        ))) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validClaimIds'], message: 'Every verified mechanism requires condition-scoped evidence.' });
        }
        if (['moderate', 'high', 'severe'].includes(verification.verifiedBand)
          && !verifiedClaims.some((claim) => claim.direction === 'raises')) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'validClaimIds'], message: 'Moderate or higher verified concern requires evidence that supports increased caution.' });
        }
        if (verification.verifiedBand === 'none'
          && (
            verification.validMechanismKeys.length
            || verification.validSourceFactIds.length
            || verification.validClaimIds.length
            || verification.validPersonalEvidenceIds.length
          )) {
          context.addIssue({ code: z.ZodIssueCode.custom, path, message: 'A none verification cannot retain scoring drivers.' });
        }
      });
    });
  });
  return defineStructuredOutput('concern_v1_verification', schema);
}

export type ConcernMechanismMappingPayload = z.infer<typeof mechanismMappingPayloadSchema>;
export type ConcernAdjudicationPayload = z.infer<typeof adjudicationPayloadSchema>;
export type ConcernVerificationPayload = z.infer<typeof verificationPayloadSchema>;

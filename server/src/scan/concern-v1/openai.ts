import type { StructuredAnalysisV2, MenuScanAnalysis, IngredientInsight, UserProfile } from '../engine/domain';
import { runResponsesRequestWithAuditRetry } from '../engine/openaiClient';
import type { OpenAiAuditLog } from '../engine/openaiTypes';
import {
  CONCERN_ADJUDICATION_MODEL,
  CONCERN_BATCH_SIZE,
  CONCERN_MAX_OUTPUT_TOKENS,
  CONCERN_MECHANISM_MODEL,
  CONCERN_TIMEOUT_MS,
  CONCERN_VERIFICATION_MODEL,
  concernReasoningFields,
  concernVerbosityField,
} from './config';
import {
  CONCERN_V1_VERSION,
  type ConcernConditionContext,
  type ConcernEvidenceClaim,
  type ConcernMechanismMap,
  type ConcernPersonalEvidence,
  type ConcernSubject,
  type ConcernSubjectDecision,
  type ConcernSubjectVerification,
  type ConcernV1ShadowRun,
} from './domain';
import { loadConcernEvidenceCatalog } from './evidence';
import { buildConcernPersonalEvidence } from './personal-evidence';
import { resolveConcernConditions } from './profile';
import {
  CONCERN_ADJUDICATION_PROMPT_VERSION,
  CONCERN_MECHANISM_PROMPT_VERSION,
  CONCERN_VERIFICATION_PROMPT_VERSION,
  concernAdjudicationSystemPrompt,
  concernAdjudicationUserPrompt,
  concernMechanismSystemPrompt,
  concernMechanismUserPrompt,
  concernVerificationSystemPrompt,
  concernVerificationUserPrompt,
} from './prompts';
import { retrieveConcernEvidence } from './retrieval';
import {
  concernAdjudicationOutput,
  concernMechanismMappingOutput,
  concernVerificationOutput,
} from './schemas';
import { finalizeConcernSubject } from './scoring';
import { acquireConcernShadowSlot } from './scheduler';
import { buildConcernSubjects } from './subjects';

type ConcernInput = {
  extraction: StructuredAnalysisV2 | MenuScanAnalysis;
  profile: UserProfile | null;
  insights: IngredientInsight[];
};

function chunks<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

function personalEvidenceForSubjects(
  evidence: ConcernPersonalEvidence[],
  subjects: ConcernSubject[],
) {
  const factIds = new Set(subjects.flatMap((subject) => subject.facts.map((fact) => fact.id)));
  return evidence
    .map((entry) => ({
      ...entry,
      matchedFactIds: entry.matchedFactIds.filter((id) => factIds.has(id)),
    }))
    .filter((entry) => entry.matchedFactIds.length > 0);
}

function requestBody(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  format: unknown,
  effort: 'low' | 'medium',
) {
  return {
    model,
    max_output_tokens: CONCERN_MAX_OUTPUT_TOKENS,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
      { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
    ],
    text: { ...concernVerbosityField(model), format },
    ...concernReasoningFields(model, effort),
  };
}

async function mapMechanisms(subjects: ConcernSubject[]) {
  const systemPrompt = concernMechanismSystemPrompt();
  const userPrompt = concernMechanismUserPrompt(subjects);
  const output = concernMechanismMappingOutput(subjects);
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    requestBody(CONCERN_MECHANISM_MODEL, systemPrompt, userPrompt, output.format, 'low'),
    output,
    {
      stage: 'concern_v1_mechanism_mapping',
      model: CONCERN_MECHANISM_MODEL,
      promptVersion: CONCERN_MECHANISM_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: output.jsonSchema,
      schemaVersion: 'concern_v1_mechanism_mapping_v1',
      requestMetadata: { subjectCount: subjects.length, factCount: subjects.reduce((sum, subject) => sum + subject.facts.length, 0) },
      inputRefs: subjects.map((subject) => ({ inputKind: 'concern_subject', subjectId: subject.id })),
    },
    { timeoutMs: CONCERN_TIMEOUT_MS },
  );
  return {
    maps: parsed.subjects as ConcernMechanismMap[],
    audit: { ...audit, normalizedResponseJson: parsed } as OpenAiAuditLog,
  };
}

async function adjudicate(input: {
  subjects: ConcernSubject[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
  claims: ConcernEvidenceClaim[];
  personalEvidence: ConcernPersonalEvidence[];
}) {
  const systemPrompt = concernAdjudicationSystemPrompt();
  const userPrompt = concernAdjudicationUserPrompt(input);
  const output = concernAdjudicationOutput(input);
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    requestBody(CONCERN_ADJUDICATION_MODEL, systemPrompt, userPrompt, output.format, 'medium'),
    output,
    {
      stage: 'concern_v1_adjudication',
      model: CONCERN_ADJUDICATION_MODEL,
      promptVersion: CONCERN_ADJUDICATION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: output.jsonSchema,
      schemaVersion: 'concern_v1_adjudication_v1',
      requestMetadata: {
        subjectCount: input.subjects.length,
        conditionCount: input.conditions.length,
        mechanismCount: input.mechanismMaps.reduce((sum, map) => sum + map.exposures.length, 0),
        claimCount: input.claims.length,
        personalEvidenceCount: input.personalEvidence.length,
      },
      inputRefs: input.claims.map((claim) => ({ inputKind: 'evidence_claim', claimId: claim.id, sourceUrl: claim.source.url })),
    },
    { timeoutMs: CONCERN_TIMEOUT_MS },
  );
  return {
    decisions: parsed.subjects as ConcernSubjectDecision[],
    audit: { ...audit, normalizedResponseJson: parsed } as OpenAiAuditLog,
  };
}

async function verify(input: {
  subjects: ConcernSubject[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
  claims: ConcernEvidenceClaim[];
  personalEvidence: ConcernPersonalEvidence[];
  decisions: ConcernSubjectDecision[];
}) {
  const systemPrompt = concernVerificationSystemPrompt();
  const userPrompt = concernVerificationUserPrompt(input);
  const output = concernVerificationOutput({ decisions: input.decisions, claims: input.claims });
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    requestBody(CONCERN_VERIFICATION_MODEL, systemPrompt, userPrompt, output.format, 'medium'),
    output,
    {
      stage: 'concern_v1_verification',
      model: CONCERN_VERIFICATION_MODEL,
      promptVersion: CONCERN_VERIFICATION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: output.jsonSchema,
      schemaVersion: 'concern_v1_verification_v1',
      requestMetadata: {
        subjectCount: input.subjects.length,
        conditionCount: input.conditions.length,
        proposedHighOrSevereCount: input.decisions
          .flatMap((subject) => subject.conditions)
          .filter((condition) => condition.personalizedBand === 'high' || condition.personalizedBand === 'severe').length,
      },
      inputRefs: input.claims.map((claim) => ({ inputKind: 'evidence_claim', claimId: claim.id, sourceUrl: claim.source.url })),
    },
    { timeoutMs: CONCERN_TIMEOUT_MS },
  );
  return {
    verifications: parsed.subjects as ConcernSubjectVerification[],
    audit: { ...audit, normalizedResponseJson: parsed } as OpenAiAuditLog,
  };
}

function auditFromError(error: unknown): OpenAiAuditLog | null {
  if (!error || typeof error !== 'object' || !('audit' in error)) return null;
  return (error as { audit?: OpenAiAuditLog }).audit ?? null;
}

function failureCode(error: unknown) {
  if (error instanceof Error && /^[a-z0-9_:.-]+$/i.test(error.message)) return error.message.slice(0, 120);
  return 'concern_v1_stage_failed';
}

async function runConcernV1ShadowInternal(input: ConcernInput): Promise<ConcernV1ShadowRun> {
  const catalog = loadConcernEvidenceCatalog();
  const subjects = buildConcernSubjects(input.extraction);
  if (!subjects.length) {
    return {
      result: {
        engineVersion: CONCERN_V1_VERSION,
        evidenceVersion: catalog.version,
        status: 'failed',
        stage: 'initialization',
        code: 'concern_v1_no_subjects',
      },
      audits: [],
    };
  }
  if (new Set(subjects.map((subject) => subject.id)).size !== subjects.length) {
    return {
      result: {
        engineVersion: CONCERN_V1_VERSION,
        evidenceVersion: catalog.version,
        status: 'failed',
        stage: 'initialization',
        code: 'concern_v1_duplicate_subject_ids',
      },
      audits: [],
    };
  }
  const conditions = resolveConcernConditions(input.profile);
  const personalEvidence = buildConcernPersonalEvidence(subjects, input.insights);
  const audits: OpenAiAuditLog[] = [];
  const mechanismMaps: ConcernMechanismMap[] = [];

  try {
    for (const batch of chunks(subjects, CONCERN_BATCH_SIZE)) {
      const mapped = await mapMechanisms(batch);
      mechanismMaps.push(...mapped.maps);
      audits.push(mapped.audit);
    }
  } catch (error) {
    const audit = auditFromError(error);
    if (audit) audits.push(audit);
    return { result: { engineVersion: CONCERN_V1_VERSION, evidenceVersion: catalog.version, status: 'failed', stage: 'mechanism_mapping', code: failureCode(error) }, audits };
  }

  const evidence = retrieveConcernEvidence({ claims: catalog.claims, conditions, mechanismMaps });
  const decisions: ConcernSubjectDecision[] = [];
  try {
    for (const batch of chunks(subjects, CONCERN_BATCH_SIZE)) {
      const ids = new Set(batch.map((subject) => subject.id));
      const batchMaps = mechanismMaps.filter((map) => ids.has(map.subjectId));
      const batchClaims = retrieveConcernEvidence({ claims: evidence, conditions, mechanismMaps: batchMaps });
      const batchPersonalEvidence = personalEvidenceForSubjects(personalEvidence, batch);
      const result = await adjudicate({
        subjects: batch,
        conditions,
        mechanismMaps: batchMaps,
        claims: batchClaims,
        personalEvidence: batchPersonalEvidence,
      });
      decisions.push(...result.decisions);
      audits.push(result.audit);
    }
  } catch (error) {
    const audit = auditFromError(error);
    if (audit) audits.push(audit);
    return { result: { engineVersion: CONCERN_V1_VERSION, evidenceVersion: catalog.version, status: 'failed', stage: 'adjudication', code: failureCode(error) }, audits };
  }

  const verifications: ConcernSubjectVerification[] = [];
  try {
    for (const batch of chunks(subjects, CONCERN_BATCH_SIZE)) {
      const ids = new Set(batch.map((subject) => subject.id));
      const batchMaps = mechanismMaps.filter((map) => ids.has(map.subjectId));
      const batchDecisions = decisions.filter((decision) => ids.has(decision.subjectId));
      const selectedClaimIds = new Set(batchDecisions.flatMap((decision) => decision.conditions.flatMap((condition) => condition.claimIds)));
      const batchClaims = evidence.filter((claim) => selectedClaimIds.has(claim.id));
      const batchPersonalEvidence = personalEvidenceForSubjects(personalEvidence, batch);
      const result = await verify({
        subjects: batch,
        conditions,
        mechanismMaps: batchMaps,
        claims: batchClaims,
        personalEvidence: batchPersonalEvidence,
        decisions: batchDecisions,
      });
      verifications.push(...result.verifications);
      audits.push(result.audit);
    }
  } catch (error) {
    const audit = auditFromError(error);
    if (audit) audits.push(audit);
    return { result: { engineVersion: CONCERN_V1_VERSION, evidenceVersion: catalog.version, status: 'failed', stage: 'verification', code: failureCode(error) }, audits };
  }

  try {
    const subjectResults = subjects.map((subject) => {
      const decision = decisions.find((entry) => entry.subjectId === subject.id);
      const verification = verifications.find((entry) => entry.subjectId === subject.id);
      if (!decision || !verification) throw new Error('concern_v1_missing_subject_result');
      return finalizeConcernSubject({
        subject,
        conditionContexts: conditions,
        decisions: decision.conditions,
        verification,
      });
    });
    return {
      result: {
        engineVersion: CONCERN_V1_VERSION,
        evidenceVersion: catalog.version,
        status: 'completed',
        conditions,
        subjects: subjectResults,
        generatedAt: new Date().toISOString(),
      },
      audits,
    };
  } catch (error) {
    return { result: { engineVersion: CONCERN_V1_VERSION, evidenceVersion: catalog.version, status: 'failed', stage: 'finalization', code: failureCode(error) }, audits };
  }
}

export async function runConcernV1Shadow(input: ConcernInput): Promise<ConcernV1ShadowRun> {
  const release = await acquireConcernShadowSlot();
  if (!release) {
    return {
      result: {
        engineVersion: CONCERN_V1_VERSION,
        evidenceVersion: 'unavailable',
        status: 'failed',
        stage: 'initialization',
        code: 'concern_v1_queue_saturated',
      },
      audits: [],
    };
  }
  try {
    return await runConcernV1ShadowInternal(input);
  } catch (error) {
    const audit = auditFromError(error);
    return {
      result: {
        engineVersion: CONCERN_V1_VERSION,
        evidenceVersion: 'unavailable',
        status: 'failed',
        stage: 'initialization',
        code: failureCode(error),
      },
      audits: audit ? [audit] : [],
    };
  } finally {
    release();
  }
}

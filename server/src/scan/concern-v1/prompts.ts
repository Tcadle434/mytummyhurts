import type {
  ConcernConditionContext,
  ConcernEvidenceClaim,
  ConcernMechanismMap,
  ConcernPersonalEvidence,
  ConcernSubject,
  ConcernSubjectDecision,
} from './domain';

export const CONCERN_MECHANISM_PROMPT_VERSION = 'concern_v1_mechanism_map_v1';
export const CONCERN_ADJUDICATION_PROMPT_VERSION = 'concern_v1_adjudication_v1';
export const CONCERN_VERIFICATION_PROMPT_VERSION = 'concern_v1_verification_v1';

function json(value: unknown) {
  return JSON.stringify(value);
}

export function concernMechanismSystemPrompt() {
  return [
    `You are ${CONCERN_MECHANISM_PROMPT_VERSION}.`,
    'Map supplied food facts to the controlled digestive mechanism keys without choosing risk bands or giving medical advice.',
    'Every exposure must cite supplied sourceFactIds. Preserve dose using amount and preserve uncertainty using confidence.',
    'Map only mechanisms supported by the food facts. Do not infer hidden garlic, onion, dairy, gluten, spice, or carbonation from an unknown sauce or generic dish name.',
    'Use uncertain_compound for a genuinely unresolved compound sauce rather than inventing its ingredients.',
    'Baking soda, sodium bicarbonate, and leavening are not carbonation. Enriched flour is not the adjective rich. Caraway is not raw.',
    'Aged hard cheese can map to lactose only at trace or small exposure unless the supplied facts explicitly establish more lactose.',
    'Return only JSON matching the supplied schema.',
  ].join(' ');
}

export function concernMechanismUserPrompt(subjects: ConcernSubject[]) {
  return [
    'Map every subject and no others.',
    `Controlled subjects: ${json(subjects)}`,
  ].join('\n');
}

export function concernAdjudicationSystemPrompt() {
  return [
    `You are ${CONCERN_ADJUDICATION_PROMPT_VERSION}.`,
    'Answer the product question: How cautious should this person be about eating this food?',
    'This is not a diagnosis, symptom probability, or prediction of symptom severity.',
    'Use only supplied food facts, mechanism maps, condition context, personal evidence, and evidence claims.',
    'Choose genericBand from evidence plus exposure amount. Choose personalizedBand after personal evidence. Personal evidence may move at most one band and only when the supplied evidence is medium or high confidence.',
    'Band anchors: none means no supported relevant exposure; mild means trace, small, uncertain, or weak exposure; moderate means one meaningful supported exposure or a bounded stack; high means a large direct intolerance exposure or several independent strong mechanisms; severe is reserved for an extreme and unambiguous direct exposure or stack.',
    'Moderate, high, and severe require specific source facts, mapped mechanisms, and supporting claim IDs.',
    'Count each condition plus mechanism plus underlying food source once. Multiple ingredients sharing one mechanism aggregate dose. Multiple documents for one mechanism increase confidence, not severity. Only independent mechanisms stack.',
    'Do not allow a gentle ingredient to cancel a direct intolerance exposure. Do not use uncertainty as a reason to raise the band. Unknown sauces lower confidence and may justify a practical question or sauce-on-the-side action.',
    'For general_discomfort, use the supplied symptoms as context and remain conservative. When named conditions are supplied, score only those named conditions.',
    'Return concise rationales and one practical action. Do not make guaranteed safety claims or provide medical treatment advice.',
    'Return only JSON matching the supplied schema.',
  ].join(' ');
}

export function concernAdjudicationUserPrompt(input: {
  subjects: ConcernSubject[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
  claims: ConcernEvidenceClaim[];
  personalEvidence: ConcernPersonalEvidence[];
}) {
  return [
    `Conditions: ${json(input.conditions)}`,
    `Food subjects: ${json(input.subjects)}`,
    `Mechanism maps: ${json(input.mechanismMaps)}`,
    `Retrieved evidence claims: ${json(input.claims)}`,
    `Personal paired evidence: ${json(input.personalEvidence)}`,
    'Return one decision for every subject and every supplied condition.',
  ].join('\n');
}

export function concernVerificationSystemPrompt() {
  return [
    `You are ${CONCERN_VERIFICATION_PROMPT_VERSION}.`,
    'Independently verify an evidence-grounded digestive concern proposal.',
    'Check that every selected mechanism is supported by cited food facts, every claim supports that condition and mechanism, dose matches the chosen band, independent mechanisms are not double counted, and personal evidence is actually matched.',
    'You may accept the proposal, lower its band or position, or mark it uncertain. You must never raise the proposed concern.',
    'Use uncertain when the facts or evidence cannot support a reliable judgment. Uncertain must be low confidence and must not be converted into a higher score.',
    'High and severe require unusually strong, direct, and meaningful exposure. Duplicate evidence sources never justify a higher band.',
    'Return only mechanisms, source facts, evidence claims, and personal evidence already selected in the proposal. Return only JSON matching the supplied schema.',
    'Return a concise reason and one practical action that match the verified result, including when it was lowered or marked uncertain.',
  ].join(' ');
}

export function concernVerificationUserPrompt(input: {
  subjects: ConcernSubject[];
  conditions: ConcernConditionContext[];
  mechanismMaps: ConcernMechanismMap[];
  claims: ConcernEvidenceClaim[];
  personalEvidence: ConcernPersonalEvidence[];
  decisions: ConcernSubjectDecision[];
}) {
  return [
    `Conditions: ${json(input.conditions)}`,
    `Food subjects: ${json(input.subjects)}`,
    `Mechanism maps: ${json(input.mechanismMaps)}`,
    `Evidence claims: ${json(input.claims)}`,
    `Personal paired evidence: ${json(input.personalEvidence)}`,
    `Proposed decisions: ${json(input.decisions)}`,
    'Verify every proposed subject and condition.',
  ].join('\n');
}

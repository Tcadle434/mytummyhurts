export const CONDITION_DRIVERS_REQUIRED_MESSAGE =
  'Moderate, high, and severe condition bands require at least one supporting driver.';

export const REQUESTED_CONDITION_REQUIRED_MESSAGE =
  'Condition must match one of the conditions requested for adjudication.';

export const REQUESTED_CONDITION_SET_REQUIRED_MESSAGE =
  'Condition severities must include exactly one entry for each requested condition.';

export const SAFE_STRUCTURED_OUTPUT_MESSAGES = new Set([
  CONDITION_DRIVERS_REQUIRED_MESSAGE,
  REQUESTED_CONDITION_REQUIRED_MESSAGE,
  REQUESTED_CONDITION_SET_REQUIRED_MESSAGE,
  'A higher personalized band requires stronger reactive evidence.',
  'A lower personalized band requires stronger calm evidence.',
  'A none decision cannot retain scoring drivers.',
  'A none verification cannot retain scoring drivers.',
  'Accepted decisions must preserve the proposed band and position.',
  'Citations must support the selected condition and mechanism.',
  'Decision mechanisms must come from the mechanism map.',
  'Decision sources must reference supplied food facts.',
  'Decision sources must support a selected mechanism.',
  'Duplicate identifiers are not allowed.',
  'Duplicate mechanism exposures are not allowed.',
  'Duplicate verified identifiers are not allowed.',
  'Every selected mechanism requires a cited source fact.',
  'Every selected mechanism requires a condition-scoped evidence claim.',
  'Every verified mechanism requires condition-scoped evidence.',
  'Lowered decisions must reduce concern.',
  'Mechanism source identifiers must be unique.',
  'Mechanism sources must reference supplied food fact identifiers.',
  'Moderate or higher concern requires evidence that supports increased caution.',
  'Moderate or higher concern requires facts, mechanisms, and supporting evidence.',
  'Moderate or higher verified concern requires evidence that supports increased caution.',
  'Must return every requested condition exactly once.',
  'Must return every requested subject exactly once.',
  'Must return exactly one mechanism map for every requested subject.',
  'Must verify every proposed condition exactly once.',
  'Must verify every requested subject exactly once.',
  'Non-none concern requires a mapped mechanism.',
  'Non-none concern requires condition-scoped evidence.',
  'Non-none verified concern requires a source fact.',
  'Non-none verified concern requires a supported mechanism.',
  'Non-none verified concern requires evidence.',
  'Personal evidence does not support this band movement.',
  'Personal evidence must match a selected food fact.',
  'The verifier may not introduce citations.',
  'The verifier may not introduce mechanisms.',
  'The verifier may not introduce personal evidence.',
  'The verifier may not introduce source facts.',
  'The verifier may not raise concern.',
  'Uncertain verification must have low confidence.',
]);

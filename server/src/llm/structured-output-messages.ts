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
]);

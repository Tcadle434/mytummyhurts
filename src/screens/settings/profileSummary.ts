/**
 * Builds the warm one-sentence summary for the Settings profile hero — the
 * "what Pip knows about you" card. Pure string work, kept out of the screen
 * component so it stays testable.
 */

type ProfileSummaryInput = {
  conditions: string[];
  sensitivities: string[];
  dietLabels: string[];
};

// A couple of catalog entries read awkwardly mid-sentence; map them to
// speakable phrasings. Everything else passes through untouched.
const CONDITION_SUMMARY_LABELS: Record<string, string> = {
  'GERD / Acid reflux': 'GERD',
  'Unsure, just general discomfort': 'general discomfort',
};

const EMPTY_PROFILE_SUMMARY =
  'Not much yet — the more you fill in below, the more personal every scan gets.';

// Lowercase plain capitalized words ("Dairy" → "dairy") for mid-sentence use,
// but leave acronyms and mixed-case entries ("IBS", "Low FODMAP") alone.
function inSentence(value: string): string {
  return /^[A-Z][a-z]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function summarizeItems(values: string[], maxShown = 2): string {
  if (values.length <= maxShown) {
    return joinWithAnd(values.map(inSentence));
  }
  const shown = values.slice(0, maxShown).map(inSentence);
  return joinWithAnd([...shown, `${values.length - maxShown} more`]);
}

export function describeProfileForPip({
  conditions,
  sensitivities,
  dietLabels,
}: ProfileSummaryInput): string {
  const parts: string[] = [];

  if (conditions.length > 0) {
    const labels = conditions.map((value) => CONDITION_SUMMARY_LABELS[value] ?? value);
    parts.push(`living with ${summarizeItems(labels)}`);
  }
  if (sensitivities.length > 0) {
    parts.push(`keeping an eye on ${summarizeItems(sensitivities)}`);
  }
  if (dietLabels.length > 0) {
    parts.push(
      dietLabels.length === 1
        ? `eating ${inSentence(dietLabels[0] ?? '')}`
        : `working toward ${dietLabels.length} diet goals`,
    );
  }

  if (parts.length === 0) {
    return EMPTY_PROFILE_SUMMARY;
  }

  return `You're ${joinWithAnd(parts)}.`;
}

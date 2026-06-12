const CONDITION_ACRONYMS = ['GERD', 'IBS', 'IBD', 'SIBO', 'GI'];

// Stored condition names are user-entered ("gerd", "Ibs"); render acronyms
// correctly without rewriting stored data. Server mirrors this in scoring.ts.
export function formatConditionName(condition: string) {
  let formatted = condition;
  for (const acronym of CONDITION_ACRONYMS) {
    formatted = formatted.replace(new RegExp(`\\b${acronym}\\b`, 'gi'), acronym);
  }
  return formatted;
}

import type { TriggerProfileEntry } from '../../features/insights/triggerGroups';
import { evidenceDetailForInsight } from '../../features/insights/triggerProfile';

export const CELEBRATED_CLEARED_STORAGE_KEY = 'cleared-celebrations-v1';

export type ClearedCelebrationCandidate = {
  key: string;
  label: string;
  emoji: string;
  evidenceLine: string;
  memberSummary?: string;
};

export function celebrationKeyForEntry(entry: Pick<TriggerProfileEntry, 'kind' | 'key'>): string {
  return `${entry.kind}:${entry.key}`;
}

export function parseCelebratedKeys(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

export function serializeCelebratedKeys(keys: Set<string>): string {
  return JSON.stringify([...keys]);
}

/**
 * The first uncelebrated cleared entry, or null. One celebration per visit —
 * a queue of confetti is a chore, a single moment is a gift.
 */
export function nextClearedCelebration(
  clearedEntries: TriggerProfileEntry[],
  celebratedKeys: Set<string>,
): ClearedCelebrationCandidate | null {
  for (const entry of clearedEntries) {
    const key = celebrationKeyForEntry(entry);
    if (celebratedKeys.has(key)) continue;
    return {
      key,
      label: entry.label,
      emoji: entry.emoji,
      evidenceLine: evidenceDetailForInsight(entry.insight, 'cleared'),
      memberSummary: entry.members.length > 1 ? entry.memberSummary : undefined,
    };
  }
  return null;
}

export function buildCelebrationShareText(candidate: ClearedCelebrationCandidate): string {
  return `Cleared: ${candidate.label} ✅\n${candidate.evidenceLine}.\n— my Trigger Profile on MyTummyHurts`;
}

import type { IngredientInsight } from '../../types/domain';
import { buildGroupedTriggerEntries, type GroupedTriggerEntry } from './triggerGroups';

export type TriggerStatus = 'confirmed' | 'suspect' | 'cleared' | 'safe';

// Core taxonomy for the Trigger Profile: every insight is bucketed by how much
// outcome evidence backs it. "Suspect" covers both declared/seeded entries and
// early elevated patterns; neutral mid-zone insights return null and stay out
// of the headline buckets.
export function statusForInsight(insight: IngredientInsight): TriggerStatus | null {
  if (
    insight.combinedRiskScore >= 60 &&
    (insight.confidenceLevel === 'high' || insight.negativeEvidenceCount >= 3)
  ) {
    return 'confirmed';
  }

  if (
    insight.sourceBreakdown.declared &&
    insight.positiveEvidenceCount >= 2 &&
    insight.negativeEvidenceCount === 0
  ) {
    return 'cleared';
  }

  if (
    insight.combinedRiskScore >= 52 ||
    (insight.sourceBreakdown.declared && insight.combinedRiskScore >= 45)
  ) {
    return 'suspect';
  }

  if (insight.combinedRiskScore <= 44) {
    return 'safe';
  }

  return null;
}

export type TriggerCounts = {
  confirmed: number;
  suspects: number;
  cleared: number;
  safe: number;
};

type OptionalInsights = IngredientInsight[] | null | undefined;

function normalizeInsights(insights: OptionalInsights): IngredientInsight[] {
  return Array.isArray(insights) ? insights : [];
}

export function summarizeTriggerCounts(insights: OptionalInsights): TriggerCounts {
  const counts: TriggerCounts = { confirmed: 0, suspects: 0, cleared: 0, safe: 0 };
  for (const insight of normalizeInsights(insights)) {
    const status = statusForInsight(insight);
    if (status === 'confirmed') counts.confirmed += 1;
    else if (status === 'suspect') counts.suspects += 1;
    else if (status === 'cleared') counts.cleared += 1;
    else if (status === 'safe') counts.safe += 1;
  }
  return counts;
}

// Evidence line shown under each row: progress toward a verdict for suspects,
// the supporting evidence for everything else.
export function evidenceDetailForInsight(insight: IngredientInsight, status: TriggerStatus): string {
  const negative = insight.negativeEvidenceCount;
  const positive = insight.positiveEvidenceCount;

  if (status === 'suspect') {
    if (negative + positive === 0) {
      return insight.sourceBreakdown.declared
        ? 'From your profile — no outcomes logged yet'
        : 'Early signal — no outcomes logged yet';
    }
    return `${Math.min(negative + positive, 3)} of 3 paired outcomes logged`;
  }

  if (status === 'confirmed') {
    return `${negative} rough-day data point${negative === 1 ? '' : 's'}`;
  }

  if (status === 'cleared') {
    return `${positive} calm day${positive === 1 ? '' : 's'} since you flagged it`;
  }

  return positive > 0 ? `${positive} calm-day data point${positive === 1 ? '' : 's'}` : 'Looking gentle so far';
}

export type TriggerProfileSection = {
  status: TriggerStatus;
  title: string;
  subtitle: string;
  entries: GroupedTriggerEntry[];
};

export type TriggerProfileViewState = {
  counts: TriggerCounts;
  sections: TriggerProfileSection[];
  totalTracked: number;
  allSeeded: boolean;
  earlySignals: IngredientInsight[];
};

const SECTION_META: Record<TriggerStatus, { title: string; subtitle: string }> = {
  confirmed: { title: 'Confirmed triggers', subtitle: 'Strong evidence from your check-ins.' },
  suspect: { title: 'Under review', subtitle: 'Suspects your daily check-ins confirm or clear.' },
  cleared: { title: 'Cleared', subtitle: 'You suspected these — the evidence says they sit fine.' },
  safe: { title: 'Safe foods', subtitle: 'Consistently calm for your gut.' },
};

export function buildTriggerProfileViewState(
  insights: OptionalInsights,
  filters: { search?: string; condition?: string } = {},
): TriggerProfileViewState {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const condition = filters.condition?.trim().toLowerCase() ?? '';

  const filtered = normalizeInsights(insights).filter((insight) => {
    if (search && !insight.ingredientName.toLowerCase().includes(search)) {
      return false;
    }
    if (
      condition &&
      !insight.linkedConditions.some((linked) => linked.toLowerCase() === condition)
    ) {
      return false;
    }
    return true;
  });

  const { entries, earlySignals } = buildGroupedTriggerEntries(filtered);

  const byStatus: Record<TriggerStatus, GroupedTriggerEntry[]> = {
    confirmed: [],
    suspect: [],
    cleared: [],
    safe: [],
  };
  for (const entry of entries) {
    const status = statusForInsight(entry.insight);
    if (status) {
      byStatus[status].push(entry);
    }
  }

  byStatus.confirmed.sort((l, r) => r.insight.combinedRiskScore - l.insight.combinedRiskScore);
  byStatus.suspect.sort(
    (l, r) =>
      r.insight.negativeEvidenceCount - l.insight.negativeEvidenceCount ||
      r.insight.combinedRiskScore - l.insight.combinedRiskScore,
  );
  byStatus.cleared.sort((l, r) => r.insight.positiveEvidenceCount - l.insight.positiveEvidenceCount);
  byStatus.safe.sort((l, r) => l.insight.combinedRiskScore - r.insight.combinedRiskScore);

  const order: TriggerStatus[] = ['confirmed', 'suspect', 'cleared', 'safe'];
  const sections = order
    .filter((status) => byStatus[status].length > 0)
    .map((status) => ({ status, ...SECTION_META[status], entries: byStatus[status] }));

  const counts: TriggerCounts = { confirmed: 0, suspects: 0, cleared: 0, safe: 0 };
  for (const section of sections) {
    if (section.status === 'confirmed') counts.confirmed = section.entries.length;
    else if (section.status === 'suspect') counts.suspects = section.entries.length;
    else if (section.status === 'cleared') counts.cleared = section.entries.length;
    else counts.safe = section.entries.length;
  }

  return {
    counts,
    sections,
    totalTracked: filtered.length,
    allSeeded:
      filtered.length > 0 &&
      filtered.every(
        (insight) => insight.positiveEvidenceCount + insight.negativeEvidenceCount === 0,
      ),
    earlySignals,
  };
}

export function entryDisplayName(entry: GroupedTriggerEntry): string {
  return entry.kind === 'group'
    ? entry.group.label
    : entry.insight.ingredientName.charAt(0).toUpperCase() + entry.insight.ingredientName.slice(1);
}

export function buildTriggerProfileShareText(viewState: TriggerProfileViewState): string {
  const lines: string[] = ['My Trigger Profile — MyTummyHurts'];

  for (const section of viewState.sections) {
    const names = section.entries.slice(0, 5).map(entryDisplayName).join(', ');
    lines.push(`${section.title}: ${names}`);
  }

  if (lines.length === 1) {
    lines.push('Still gathering evidence — check back soon.');
  }

  return lines.join('\n');
}

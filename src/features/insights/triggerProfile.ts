import { triggerVerdictStatusForBreakdown, TRIGGER_VERDICT_THRESHOLDS } from '@mth/shared-domain';

import type { IngredientInsight } from '../../types/domain';
import {
  buildFamilyVerdictEntries,
  buildGroupedTriggerEntries,
  buildTrackedFoodFamilyEntries,
  conditionLensFromKnownConditions,
  groupByKey,
  groupConditionTie,
  type TriggerProfileEntry,
  type TrackedFoodFamilyEntry,
} from './triggerGroups';

// Every tracked food resolves to one of five verdict statuses — the caseboard
// model. 'watching' is the honest cold-start home for foods without
// directional evidence (previously they fell into a null dead zone and
// vanished from the screen entirely).
export type TriggerStatus = 'confirmed' | 'suspect' | 'watching' | 'cleared' | 'safe';

export function statusForInsight(insight: IngredientInsight): TriggerStatus {
  return triggerVerdictStatusForBreakdown(insight);
}

// The verdict for a group/family row derives from its members' own verdicts —
// never from a synthetic insight that mixes fields (max risk from one member,
// confidence from another) into a status no member earned. Cleared requires
// every member to have earned it; any confirmed member confirms the row.
export function statusForMembers(members: IngredientInsight[]): TriggerStatus {
  const statuses = members.map(statusForInsight);
  if (statuses.includes('confirmed')) return 'confirmed';
  if (statuses.includes('suspect')) return 'suspect';
  if (statuses.length > 0 && statuses.every((status) => status === 'cleared')) return 'cleared';
  if (statuses.includes('safe') || statuses.includes('cleared')) return 'safe';
  return 'watching';
}

export type TriggerCounts = {
  confirmed: number;
  suspects: number;
  watching: number;
  cleared: number;
  safe: number;
};

type OptionalInsights = IngredientInsight[] | null | undefined;

function normalizeInsights(insights: OptionalInsights): IngredientInsight[] {
  return Array.isArray(insights) ? insights : [];
}

const EMPTY_COUNTS: TriggerCounts = { confirmed: 0, suspects: 0, watching: 0, cleared: 0, safe: 0 };

export function summarizeTriggerCounts(insights: OptionalInsights): TriggerCounts {
  const counts: TriggerCounts = { ...EMPTY_COUNTS };
  for (const insight of normalizeInsights(insights)) {
    const status = statusForInsight(insight);
    if (status === 'confirmed') counts.confirmed += 1;
    else if (status === 'suspect') counts.suspects += 1;
    else if (status === 'watching') counts.watching += 1;
    else if (status === 'cleared') counts.cleared += 1;
    else counts.safe += 1;
  }
  return counts;
}

function pluralDays(count: number) {
  return `${count} day${count === 1 ? '' : 's'}`;
}

function pairedDayCount(insight: IngredientInsight) {
  return insight.sourceBreakdown.pairedDayCount ?? insight.supportingEvidenceCount;
}

function exposureDayCount(insight: IngredientInsight) {
  return insight.sourceBreakdown.exposureDayCount ?? 0;
}

// One plain-language sentence per row: what the evidence says and what closes
// the case. Counts are distinct report days, never weighted fractions.
export function evidenceDetailForInsight(insight: IngredientInsight, status: TriggerStatus): string {
  const calm = insight.positiveEvidenceCount;
  const rough = insight.negativeEvidenceCount;
  const paired = Math.max(pairedDayCount(insight), calm + rough);
  const thresholds = TRIGGER_VERDICT_THRESHOLDS;

  if (status === 'confirmed') {
    return `Rough on ${rough} of ${paired} paired ${paired === 1 ? 'day' : 'days'} you ate this`;
  }

  if (status === 'suspect') {
    if (rough > 0) {
      const needed = Math.max(0, thresholds.confirmedReactiveDays - rough);
      return needed > 0
        ? `Rough on ${rough} of ${paired} paired ${paired === 1 ? 'day' : 'days'} — ${needed} more would confirm`
        : `Rough on ${rough} of ${paired} paired days`;
    }
    return insight.sourceBreakdown.declared
      ? 'From your answers — daily check-ins confirm or clear it'
      : 'Early signal — no outcomes logged yet';
  }

  if (status === 'cleared') {
    return `Calm on ${pluralDays(calm)} you ate this — no reactions`;
  }

  if (status === 'safe') {
    const target = insight.sourceBreakdown.declared
      ? thresholds.clearedDeclaredCalmDays
      : thresholds.clearedCalmDays;
    const needed = Math.max(0, target - calm);
    const base = `Calm on ${calm} of ${paired} paired ${paired === 1 ? 'day' : 'days'}`;
    return needed > 0 ? `${base} — ${needed} more calm ${needed === 1 ? 'day' : 'days'} to cleared` : base;
  }

  // watching
  if (paired > 0) {
    return `${paired} paired ${paired === 1 ? 'day' : 'days'} logged — no clear pattern yet`;
  }
  const seen = exposureDayCount(insight);
  if (seen > 0) {
    return `Seen in scans on ${pluralDays(seen)} — no check-ins paired yet`;
  }
  return insight.sourceBreakdown.declared
    ? 'From your answers — waiting on real-world evidence'
    : 'Waiting on real-world evidence';
}

export type TriggerProfileSection = {
  status: TriggerStatus;
  title: string;
  subtitle: string;
  entries: TriggerProfileEntry[];
};

export type TriggerProfileViewState = {
  counts: TriggerCounts;
  sections: TriggerProfileSection[];
  totalTracked: number;
  allSeeded: boolean;
  trackedFamilies: TrackedFoodFamilyEntry[];
};

const SECTION_META: Record<Exclude<TriggerStatus, 'watching'>, { title: string; subtitle: string }> = {
  confirmed: { title: 'Confirmed triggers', subtitle: 'Strong repeated evidence from your check-ins.' },
  suspect: { title: 'Under review', subtitle: 'Rough-day evidence is building — check-ins settle each case.' },
  cleared: { title: 'Cleared', subtitle: 'Calm every time you ate them. You can stop worrying about these.' },
  safe: { title: 'Looking safe', subtitle: 'Calm so far — a few more calm days earns cleared.' },
};

function outcomeCount(insight: IngredientInsight) {
  return insight.positiveEvidenceCount + insight.negativeEvidenceCount;
}

export function buildTriggerProfileViewState(
  insights: OptionalInsights,
  filters: { search?: string; condition?: string } = {},
  context: { knownConditions?: string[] } = {},
): TriggerProfileViewState {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const condition = filters.condition?.trim().toLowerCase() ?? '';
  const lens = conditionLensFromKnownConditions(context.knownConditions ?? []);

  // 1 when the entry's mechanism is clinically tied to a condition the user
  // declared. Evidence always sorts first; the lens breaks ties — so a
  // reflux user's caseboard leads with reflux-type suspects without ever
  // hiding a strong signal elsewhere.
  const lensRelevance = (entry: TriggerProfileEntry) => {
    if (entry.kind !== 'group') return 0;
    const group = groupByKey(entry.key);
    return group && groupConditionTie(group, lens) ? 1 : 0;
  };

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

  const byStatus: Record<TriggerStatus, IngredientInsight[]> = {
    confirmed: [],
    suspect: [],
    watching: [],
    cleared: [],
    safe: [],
  };
  const counts: TriggerCounts = { ...EMPTY_COUNTS };
  for (const insight of filtered) {
    const status = statusForInsight(insight);
    byStatus[status].push(insight);
    if (status === 'confirmed') counts.confirmed += 1;
    else if (status === 'suspect') counts.suspects += 1;
    else if (status === 'watching') counts.watching += 1;
    else if (status === 'cleared') counts.cleared += 1;
    else counts.safe += 1;
  }

  const sectionsByStatus: Record<Exclude<TriggerStatus, 'watching'>, TriggerProfileEntry[]> = {
    confirmed: [],
    suspect: [],
    cleared: [],
    safe: [],
  };

  // Risk track (confirmed + suspect): mechanism groups, bucketed as one pool
  // so a group lands in exactly one section — the verdict its own members
  // earn — with family entries as the fallback so ungrouped foods with real
  // evidence stay visible.
  const riskInsights = [...byStatus.confirmed, ...byStatus.suspect];
  const { entries: riskGroups, ungrouped: riskUngrouped } = buildGroupedTriggerEntries(riskInsights);
  for (const entry of [...riskGroups, ...buildFamilyVerdictEntries(riskUngrouped)]) {
    const status = statusForMembers(entry.members);
    sectionsByStatus[status === 'confirmed' ? 'confirmed' : 'suspect'].push(entry);
  }

  // Safety track (cleared + safe): food families — "rice & grains look safe"
  // reads better than a mechanism label for reassurance. A family is cleared
  // only when every member has earned it.
  for (const entry of buildFamilyVerdictEntries([...byStatus.cleared, ...byStatus.safe])) {
    const status = statusForMembers(entry.members);
    sectionsByStatus[status === 'cleared' ? 'cleared' : 'safe'].push(entry);
  }

  sectionsByStatus.confirmed.sort(
    (l, r) =>
      r.insight.combinedRiskScore - l.insight.combinedRiskScore ||
      lensRelevance(r) - lensRelevance(l),
  );
  sectionsByStatus.suspect.sort(
    (l, r) =>
      r.insight.negativeEvidenceCount - l.insight.negativeEvidenceCount ||
      lensRelevance(r) - lensRelevance(l) ||
      r.insight.combinedRiskScore - l.insight.combinedRiskScore,
  );
  sectionsByStatus.cleared.sort((l, r) => r.insight.positiveEvidenceCount - l.insight.positiveEvidenceCount);
  sectionsByStatus.safe.sort(
    (l, r) =>
      r.insight.positiveEvidenceCount - l.insight.positiveEvidenceCount ||
      l.insight.combinedRiskScore - r.insight.combinedRiskScore,
  );

  const order: Array<Exclude<TriggerStatus, 'watching'>> = ['confirmed', 'suspect', 'cleared', 'safe'];
  const sections = order
    .filter((status) => sectionsByStatus[status].length > 0)
    .map((status) => ({ status, ...SECTION_META[status], entries: sectionsByStatus[status] }));

  return {
    counts,
    sections,
    totalTracked: filtered.length,
    allSeeded:
      filtered.length > 0 &&
      filtered.every(
        (insight) => insight.sourceBreakdown.declared && outcomeCount(insight) === 0,
      ),
    trackedFamilies: buildTrackedFoodFamilyEntries(byStatus.watching),
  };
}

export function entryDisplayName(entry: TriggerProfileEntry): string {
  return entry.label;
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

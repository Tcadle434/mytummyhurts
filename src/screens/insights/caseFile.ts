import { TRIGGER_VERDICT_THRESHOLDS } from '@mth/shared-domain';

import type { TriggerStatus } from '../../features/insights/triggerProfile';
import type { IngredientInsight } from '../../types/domain';

// View model for the trigger detail "case file" screen. The screen answers one
// question — "should I be eating this?" — with a verdict sentence, the actual
// days as receipts, and what closes the case. Everything here is pure so the
// answer-building is testable without rendering.

export type CaseSubjectKind = 'family' | 'group' | 'ingredient';

export type CaseDayOutcome = 'calm' | 'mixed' | 'rough' | 'none';

export type CaseEvidenceDay = {
  localDate: string;
  dateLabel: string;
  mealTitles: string[];
  outcome: CaseDayOutcome;
};

// Narrow structural inputs so this module doesn't depend on the full scan and
// report shapes — the real records are structurally compatible.
export type CaseScanInput = {
  id: string;
  dishName: string;
  localDate?: string;
  createdAt: string;
  scanCategory?: string;
  possibleTriggers: string[];
  structuredAnalysis: {
    visibleIngredients: Array<{ canonicalName: string }>;
    inferredIngredients: Array<{ canonicalName: string }>;
  };
};

export type CaseReportInput = {
  localDate: string;
  gutSeverity: number;
};

const DEFAULT_DAY_LIMIT = 7;

function pairedDays(insight: IngredientInsight) {
  return Math.max(
    insight.sourceBreakdown.pairedDayCount ?? insight.supportingEvidenceCount,
    insight.positiveEvidenceCount + insight.negativeEvidenceCount,
  );
}

function exposureDays(insight: IngredientInsight) {
  return insight.sourceBreakdown.exposureDayCount ?? 0;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function calmDaysToClear(insight: IngredientInsight) {
  const target = insight.sourceBreakdown.declared
    ? TRIGGER_VERDICT_THRESHOLDS.clearedDeclaredCalmDays
    : TRIGGER_VERDICT_THRESHOLDS.clearedCalmDays;
  return Math.max(0, target - insight.positiveEvidenceCount);
}

function worstMember(members: IngredientInsight[]): IngredientInsight {
  return [...members].sort(
    (left, right) =>
      right.negativeEvidenceCount - left.negativeEvidenceCount ||
      right.combinedRiskScore - left.combinedRiskScore,
  )[0]!;
}

/**
 * The hero: one plain sentence combining the evidence, what it means, and —
 * where it fits — what closes the case. No system vocabulary.
 */
export function buildCaseSentence(input: {
  kind: CaseSubjectKind;
  status: TriggerStatus;
  members: IngredientInsight[];
}): string {
  const { kind, status, members } = input;
  if (!members.length) {
    return 'No foods mapped here yet — new scans will fill this in.';
  }

  const single = kind === 'ingredient' || members.length === 1;
  const count = members.length;

  if (status === 'cleared') {
    if (single) {
      const calm = members[0]!.positiveEvidenceCount;
      return `Calm on every one of the ${plural(calm, 'day')} you ate it — off the suspect list.`;
    }
    return `All ${count} foods stayed calm every time you ate them — off the suspect list.`;
  }

  if (status === 'safe') {
    if (single) {
      const insight = members[0]!;
      const needed = Math.max(1, calmDaysToClear(insight));
      return `Calm on ${plural(insight.positiveEvidenceCount, 'day')} you ate it so far — ${plural(needed, 'more calm day')} clears it.`;
    }
    const needed = Math.max(1, Math.max(...members.map(calmDaysToClear)));
    return `All ${count} foods have sat calm so far — ${plural(needed, 'more calm day')} each clears them.`;
  }

  if (status === 'confirmed' || status === 'suspect') {
    const worst = worstMember(members);
    const rough = worst.negativeEvidenceCount;

    if (rough === 0) {
      return worst.sourceBreakdown.declared
        ? 'You flagged this one — daily check-ins will confirm or clear it.'
        : 'An early signal from your answers — no real-world rough days logged yet.';
    }

    const paired = Math.max(pairedDays(worst), rough);
    const evidence = single
      ? `Rough days followed ${rough} of the ${plural(paired, 'day')} you ate this`
      : `${capitalize(worst.ingredientName)} drove this — rough on ${rough} of its ${plural(paired, 'day')}`;

    if (status === 'confirmed') {
      return `${evidence}. A strong pattern for you.`;
    }
    const toConfirm = TRIGGER_VERDICT_THRESHOLDS.confirmedReactiveDays - rough;
    if (toConfirm <= 0) {
      return `${evidence}.`;
    }
    const confirmClause = `${toConfirm} more would confirm it`;
    return single ? `${evidence} — ${confirmClause}.` : `${evidence}. ${capitalize(confirmClause)}.`;
  }

  // watching
  const paired = Math.max(...members.map(pairedDays));
  const exposure = Math.max(...members.map(exposureDays));
  if (paired > 0) {
    return `${plural(paired, 'check-in day')} so far with no clear lean — more days will tip this one.`;
  }
  if (exposure > 0) {
    return single
      ? `You've eaten this on ${plural(exposure, 'day')}, but no check-ins landed on those days yet.`
      : `These showed up on ${plural(exposure, 'day')} of meals, but no check-ins landed on those days yet.`;
  }
  return 'From your answers — waiting on real-world evidence.';
}

/** One quiet footer line: what the user can actually do about this case. */
export function buildNextStep(status: TriggerStatus): string {
  if (status === 'confirmed') {
    return 'Try a smaller portion or a swap — keep logging, and any change will show in the evidence.';
  }
  if (status === 'suspect') {
    return 'Eat normally and keep filing daily check-ins — each one moves this case.';
  }
  if (status === 'watching') {
    return 'File a check-in on days you eat this — that opens the case.';
  }
  if (status === 'safe') {
    return 'Keep check-ins coming on days you eat this — calm days finish the clearing.';
  }
  return "Nothing to do — it stays on the menu. We'll flag it if the pattern ever shifts.";
}

/** Evidence line for a member row: leads with whichever outcome exists. */
export function memberEvidenceLine(member: IngredientInsight): string {
  const rough = member.negativeEvidenceCount;
  const calm = member.positiveEvidenceCount;
  if (rough > 0) {
    return calm > 0 ? `${plural(rough, 'rough day')} · ${calm} calm` : plural(rough, 'rough day');
  }
  if (calm > 0) {
    return plural(calm, 'calm day');
  }
  if (member.sourceBreakdown.declared) {
    return 'from your answers';
  }
  const seen = exposureDays(member);
  if (seen > 0) {
    return `seen on ${plural(seen, 'day')} — no check-ins yet`;
  }
  return 'no evidence yet';
}

/** Compact evidence summary for the section header, e.g. "2 calm · 1 rough". */
export function buildEvidenceSummary(days: CaseEvidenceDay[]): string {
  const calm = days.filter((day) => day.outcome === 'calm').length;
  const rough = days.filter((day) => day.outcome === 'rough').length;
  const parts: string[] = [];
  if (calm > 0) parts.push(`${calm} calm`);
  if (rough > 0) parts.push(`${rough} rough`);
  if (!parts.length) {
    return plural(days.length, 'day');
  }
  return parts.join(' · ');
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function outcomeForSeverity(severity?: number): CaseDayOutcome {
  if (typeof severity !== 'number') return 'none';
  if (severity <= 3) return 'calm';
  if (severity <= 6) return 'mixed';
  return 'rough';
}

// Local-date strings parse as UTC midnight via `new Date(string)`, which can
// shift the label a day west of Greenwich — build the date from parts instead.
function dateLabelForLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  if (!year || !month || !day) return localDate;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The receipts: the actual days this food was eaten, joined with that day's
 * check-in outcome. Days without a check-in stay visible as 'none' — honest
 * coverage, and a quiet nudge to file one next time.
 */
export function buildDayEvidence(input: {
  memberNames: string[];
  scans: CaseScanInput[];
  reports: CaseReportInput[];
  limit?: number;
}): CaseEvidenceDay[] {
  const tokens = input.memberNames.map(normalizeToken).filter(Boolean);
  if (!tokens.length) return [];

  const severityByDate = new Map(input.reports.map((report) => [report.localDate, report.gutSeverity]));
  const byDate = new Map<string, Set<string>>();

  for (const scan of input.scans) {
    if ((scan.scanCategory ?? 'food') !== 'food') continue;
    const scanTokens = [
      scan.dishName,
      ...scan.possibleTriggers,
      ...scan.structuredAnalysis.visibleIngredients.map((entry) => entry.canonicalName),
      ...scan.structuredAnalysis.inferredIngredients.map((entry) => entry.canonicalName),
    ].map(normalizeToken);
    if (!scanTokens.some((value) => tokens.some((token) => token && value.includes(token)))) {
      continue;
    }

    const localDate = scan.localDate ?? scan.createdAt.slice(0, 10);
    const titles = byDate.get(localDate) ?? new Set<string>();
    titles.add(scan.dishName);
    byDate.set(localDate, titles);
  }

  return [...byDate.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .slice(0, input.limit ?? DEFAULT_DAY_LIMIT)
    .map(([localDate, titles]) => ({
      localDate,
      dateLabel: dateLabelForLocalDate(localDate),
      mealTitles: [...titles],
      outcome: outcomeForSeverity(severityByDate.get(localDate)),
    }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

import type { DailyGutReport, GutScoreState, IngredientInsight } from '../../types/domain';

export type ReportPayoffBaseline = {
  localDate: string;
  gutScore: number | null;
  insightEvidence: Record<
    string,
    {
      combinedRiskScore: number;
      positiveEvidenceCount: number;
      negativeEvidenceCount: number;
    }
  >;
};

export type PayoffEvidenceChange = {
  ingredientName: string;
  kind: 'trigger_strengthened' | 'safe_strengthened' | 'new_suspect';
  detail: string;
};

export type ReportPayoff = {
  dailyScore: number | null;
  gutScoreAfter: number | null;
  gutScoreDelta: number | null;
  evidenceChanges: PayoffEvidenceChange[];
};

// Decides whether the payoff screen shows its "connecting" loading card.
// Two rules keep the screen from flickering between loading and the score:
//   1. Scope: only THIS report's learning sync (source 'daily_report') drives
//      the loading state — an unrelated background 'recompute' must not show it.
//   2. Latch: once the sync has settled and the score has been revealed, it
//      stays revealed. A later ambient home snapshot that momentarily re-raises
//      learningSyncInFlight can therefore never bounce the screen back to loading.
export function resolvePayoffLoading(params: {
  revealed: boolean;
  learningSyncInFlight: boolean;
  learningSyncSource: 'daily_report' | 'recompute' | null;
}): { connecting: boolean; revealed: boolean } {
  const ourSyncInFlight =
    params.learningSyncInFlight && params.learningSyncSource === 'daily_report';
  const revealed = params.revealed || !ourSyncInFlight;
  return { connecting: ourSyncInFlight && !revealed, revealed };
}

export function buildPayoffBaseline(params: {
  localDate: string;
  gutScore: GutScoreState | null | undefined;
  insights: IngredientInsight[];
}): ReportPayoffBaseline {
  return {
    localDate: params.localDate,
    gutScore: params.gutScore?.currentScore ?? null,
    insightEvidence: params.insights.reduce<ReportPayoffBaseline['insightEvidence']>(
      (accumulator, insight) => {
        accumulator[insight.ingredientName.toLowerCase()] = {
          combinedRiskScore: insight.combinedRiskScore,
          positiveEvidenceCount: insight.positiveEvidenceCount,
          negativeEvidenceCount: insight.negativeEvidenceCount,
        };
        return accumulator;
      },
      {},
    ),
  };
}

// Diffs the post-recompute state against the pre-report baseline so the payoff
// screen can show what tonight's check-in actually taught the system.
export function buildReportPayoff(params: {
  baseline: ReportPayoffBaseline;
  report: DailyGutReport | undefined;
  gutScore: GutScoreState | null | undefined;
  insights: IngredientInsight[];
}): ReportPayoff {
  const gutScoreAfter = params.gutScore?.currentScore ?? null;
  const gutScoreDelta =
    gutScoreAfter !== null && params.baseline.gutScore !== null
      ? gutScoreAfter - params.baseline.gutScore
      : null;

  const changes: { change: PayoffEvidenceChange; weight: number }[] = [];
  for (const insight of params.insights) {
    const key = insight.ingredientName.toLowerCase();
    const before = params.baseline.insightEvidence[key];

    if (!before) {
      if (insight.positiveEvidenceCount + insight.negativeEvidenceCount > 0) {
        changes.push({
          weight: 1,
          change: {
            ingredientName: insight.ingredientName,
            kind: 'new_suspect',
            detail: `${insight.ingredientName} just entered your trigger ledger.`,
          },
        });
      }
      continue;
    }

    const negativeDelta = insight.negativeEvidenceCount - before.negativeEvidenceCount;
    const positiveDelta = insight.positiveEvidenceCount - before.positiveEvidenceCount;

    if (negativeDelta > 0) {
      changes.push({
        weight: negativeDelta + Math.abs(insight.combinedRiskScore - before.combinedRiskScore) / 10,
        change: {
          ingredientName: insight.ingredientName,
          kind: 'trigger_strengthened',
          detail: `${insight.ingredientName}: ${insight.negativeEvidenceCount} rough-day data point${
            insight.negativeEvidenceCount === 1 ? '' : 's'
          } now.`,
        },
      });
    } else if (positiveDelta > 0) {
      changes.push({
        weight: positiveDelta + Math.abs(insight.combinedRiskScore - before.combinedRiskScore) / 10,
        change: {
          ingredientName: insight.ingredientName,
          kind: 'safe_strengthened',
          detail: `${insight.ingredientName}: ${insight.positiveEvidenceCount} calm-day data point${
            insight.positiveEvidenceCount === 1 ? '' : 's'
          } now.`,
        },
      });
    }
  }

  return {
    dailyScore: params.report?.dailyScore ?? null,
    gutScoreAfter,
    gutScoreDelta,
    evidenceChanges: changes
      .sort((left, right) => right.weight - left.weight)
      .slice(0, 3)
      .map((entry) => entry.change),
  };
}

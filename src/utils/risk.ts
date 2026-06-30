import { tokens } from '../theme';

type RiskLevel = 'low' | 'medium' | 'high';

export function riskLevelColors(level: RiskLevel) {
  return tokens.color.status.risk[level];
}

export function riskLevelTint(level: RiskLevel): string {
  return tokens.color.status.risk[level].tint;
}

// Gut score (0-100, higher = better) -> risk tint. Banding matches the app's
// gut-score zones (>=67 calm/low-risk, >=34 mixed, else rough). Keep in sync
// with dailyScoreZoneColor in utils/weeklyProgress.ts.
export function gutScoreTint(score: number): string {
  if (score >= 67) return tokens.color.status.risk.low.tint;
  if (score >= 34) return tokens.color.status.risk.medium.tint;
  return tokens.color.status.risk.high.tint;
}

export function riskBadge(level: RiskLevel): { label: string; color: string; backgroundColor: string } {
  switch (level) {
    case 'low':
      return {
        label: 'SAFE',
        color: tokens.color.status.risk.low.foreground,
        backgroundColor: tokens.color.status.risk.low.background,
      };
    case 'medium':
      return {
        label: 'CAUTION',
        color: tokens.color.status.risk.medium.foreground,
        backgroundColor: tokens.color.status.risk.medium.background,
      };
    case 'high':
      return {
        label: 'WARNING',
        color: tokens.color.status.risk.high.foreground,
        backgroundColor: tokens.color.status.risk.high.background,
      };
  }
}

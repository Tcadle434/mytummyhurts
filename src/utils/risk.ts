import { tokens } from '../theme';

type RiskLevel = 'low' | 'medium' | 'high';

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

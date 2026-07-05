import { tokens, type PipState } from "../../theme";
import { DailyScoreBand, dailyScoreZoneColor } from "../../utils/weeklyProgress";

/**
 * Shared presentation mapping for Daily Score bands so every review surface
 * colors calm/mixed/rough the same way. Text always gets the darker
 * `foreground` grade; `tint` is reserved for fills and dots.
 */
export function bandRiskColors(score: number) {
	return tokens.color.status.risk[dailyScoreZoneColor(score)];
}

export function bandForeground(band: DailyScoreBand | undefined): string {
	if (band === "calm") return tokens.color.status.risk.low.foreground;
	if (band === "mixed") return tokens.color.status.risk.medium.foreground;
	if (band === "rough") return tokens.color.status.risk.high.foreground;
	return tokens.color.text.primary;
}

export function bandTint(band: DailyScoreBand): string {
	if (band === "calm") return tokens.color.status.risk.low.tint;
	if (band === "mixed") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.high.tint;
}

/** Rule 3 of the design direction: Pip's face agrees with the band color. */
export function pipStateForBand(band: DailyScoreBand | undefined): PipState {
	if (band === "calm") return "joy";
	if (band === "mixed") return "base";
	if (band === "rough") return "anxious";
	return "subtle";
}

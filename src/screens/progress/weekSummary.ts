import {
	DailyScoreBand,
	WeeklyProgressDay,
	dailyScoreBand,
	weeklyScoreDelta,
} from "../../utils/weeklyProgress";

export type WeekSummary = {
	/** The week spoken as a finding — "Mostly calm", "A rough week". */
	headline: string;
	/** Band-word day counts — "3 calm days, 1 mixed and 1 rough." */
	detail: string;
	/** Start-to-finish score movement, only when two or more days are scored. */
	deltaLine?: string;
	/** Dominant band, used to color the headline and pick Pip's face. */
	band?: DailyScoreBand;
	scoredCount: number;
};

type BandCounts = Record<DailyScoreBand, number>;

/**
 * Turns a week of Daily Score days into a spoken verdict for the Weekly
 * Progress hero. Pure and honest: no headline claims a trend that the
 * check-ins can't back up.
 */
export function buildWeekSummary(days: WeeklyProgressDay[]): WeekSummary {
	const scoredDays = days.filter((day) => day.hasReport && day.dailyScore !== undefined);
	const counts = scoredDays.reduce<BandCounts>(
		(current, day) => {
			const band = dailyScoreBand(day.dailyScore as number);
			return { ...current, [band]: current[band] + 1 };
		},
		{ calm: 0, mixed: 0, rough: 0 }
	);
	const scoredCount = scoredDays.length;
	const unloggedCount = days.length - scoredCount;

	if (scoredCount === 0) {
		const hasMeals = days.some((day) => day.mealCount > 0);
		return {
			headline: "No check-ins yet",
			detail: hasMeals
				? "Meals are logged — an evening check-in is what turns them into a score."
				: "Check in each evening and this week will start telling its story.",
			scoredCount,
		};
	}

	return {
		headline: headlineFor(counts, scoredCount),
		detail: detailFor(counts, unloggedCount),
		deltaLine: deltaLineFor(days, scoredCount),
		band: dominantBand(counts, scoredCount),
		scoredCount,
	};
}

function headlineFor(counts: BandCounts, scoredCount: number): string {
	if (counts.calm === scoredCount) return "A calm week";
	if (counts.rough === scoredCount) return "A rough week";
	if (counts.calm > counts.mixed + counts.rough) return "Mostly calm";
	if (counts.rough > counts.calm + counts.mixed) return "Mostly rough";
	return "A mixed week";
}

function dominantBand(counts: BandCounts, scoredCount: number): DailyScoreBand {
	if (counts.calm === scoredCount || counts.calm > counts.mixed + counts.rough) return "calm";
	if (counts.rough === scoredCount || counts.rough > counts.calm + counts.mixed) return "rough";
	return "mixed";
}

function detailFor(counts: BandCounts, unloggedCount: number): string {
	const parts = [
		counts.calm > 0 ? `${counts.calm} calm ${counts.calm === 1 ? "day" : "days"}` : undefined,
		counts.mixed > 0 ? `${counts.mixed} mixed` : undefined,
		counts.rough > 0 ? `${counts.rough} rough` : undefined,
	].filter((part): part is string => part !== undefined);

	const bandSentence = joinWithAnd(parts);
	if (unloggedCount === 0) {
		return `${bandSentence}.`;
	}

	const unloggedPhrase = `${unloggedCount} ${unloggedCount === 1 ? "day" : "days"} without a check-in`;
	return `${bandSentence} — ${unloggedPhrase}.`;
}

function deltaLineFor(days: WeeklyProgressDay[], scoredCount: number): string | undefined {
	if (scoredCount < 2) return undefined;

	const delta = weeklyScoreDelta(days);
	if (delta === 0) {
		return "Daily Scores held steady from start to finish.";
	}

	const magnitude = Math.abs(delta);
	const points = magnitude === 1 ? "point" : "points";
	const direction = delta > 0 ? "higher" : "lower";
	return `Daily Scores ended ${magnitude} ${points} ${direction} than they started.`;
}

function joinWithAnd(parts: string[]): string {
	if (parts.length <= 1) return parts[0] ?? "";
	return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

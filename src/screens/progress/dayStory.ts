import { ScanHistorySummary } from "../../types/domain";
import { DailyScoreBand, WeeklyProgressDay, dailyScoreBand } from "../../utils/weeklyProgress";

export type DayStory = {
	/** The day spoken as a finding — "Calm day", "Rough day". */
	headline: string;
	/** One evidence sentence tying meals and symptoms together. */
	story: string;
	/** Band for coloring the headline and picking Pip's face; unset when unscored. */
	band?: DailyScoreBand;
	/** How this day feeds the Trigger Profile, when it can. */
	profileNote?: string;
};

const MAX_NAMED_SYMPTOMS = 2;
const NOTABLE_SEVERITY_MIN = 4;

/**
 * Builds the day-detail hero copy: a verdict headline plus a one-sentence
 * evidence story assembled from what was actually logged. Honest by
 * construction — missing data is said out loud, never papered over.
 */
export function buildDayStory(day: WeeklyProgressDay): DayStory {
	const hasScore = day.hasReport && day.dailyScore !== undefined;

	if (!hasScore) {
		if (day.mealCount > 0) {
			return {
				headline: "Waiting on your check-in",
				story: `${day.mealCount} ${day.mealCount === 1 ? "meal" : "meals"} logged — add an evening check-in to score this day.`,
			};
		}
		return {
			headline: "Nothing logged yet",
			story: "No meals or symptoms were logged for this day.",
		};
	}

	const band = dailyScoreBand(day.dailyScore as number);
	return {
		headline: `${capitalize(band)} day`,
		story: buildEvidenceSentence(day, band),
		band,
		profileNote:
			day.scans.length > 0
				? `This day counted as ${band} evidence for the foods you logged.`
				: undefined,
	};
}

function buildEvidenceSentence(day: WeeklyProgressDay, band: DailyScoreBand): string {
	const symptomsPart = symptomsPhrase(day);
	const riskiest = riskiestScan(day.scans);

	if (!riskiest) {
		if (band === "calm") {
			return `${symptomsPart}, and no meals were scanned — a quiet page in the log.`;
		}
		return `${symptomsPart} — with no meals scanned, there's nothing to pin the day on yet.`;
	}

	if (riskiest.overallRiskLevel !== "low") {
		return `${symptomsPart}, and ${riskiest.dishName} was your riskiest scan of the day (${riskiest.overallRiskLevel} risk).`;
	}

	if (band === "calm") {
		return `${symptomsPart}, and every meal you scanned stayed gentle.`;
	}
	return `${symptomsPart}, yet every meal you scanned looked gentle — worth noting what else changed.`;
}

function symptomsPhrase(day: WeeklyProgressDay): string {
	const tags = day.report?.symptomTags ?? [];
	if (tags.length > 0) {
		return `You tagged ${symptomList(tags)}`;
	}

	const severity = day.report?.gutSeverity ?? 0;
	if (severity >= NOTABLE_SEVERITY_MIN) {
		return `You logged a ${severity}/10 evening with no symptoms tagged`;
	}
	return "No symptoms made the list";
}

function symptomList(tags: string[]): string {
	const named = tags.slice(0, MAX_NAMED_SYMPTOMS).map((tag) => tag.toLowerCase());
	const remaining = tags.length - named.length;
	const joined = named.join(" and ");
	if (remaining <= 0) return joined;
	return `${joined} and ${remaining} more`;
}

function riskiestScan(scans: ScanHistorySummary[]): ScanHistorySummary | undefined {
	if (scans.length === 0) return undefined;
	return scans.reduce((worst, scan) =>
		scan.overallRiskScore > worst.overallRiskScore ? scan : worst
	);
}

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

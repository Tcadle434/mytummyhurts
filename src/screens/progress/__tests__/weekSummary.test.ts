import { describe, expect, test } from "vitest";

import { buildWeekSummary } from "../weekSummary";
import { WeeklyProgressDay } from "../../../utils/weeklyProgress";

function makeDay(overrides: Partial<WeeklyProgressDay> & { localDate: string }): WeeklyProgressDay {
	return {
		weekdayLabel: "M",
		mealCount: 0,
		hasReport: false,
		trendDirection: "none",
		scans: [],
		...overrides,
	};
}

function scoredDay(localDate: string, dailyScore: number, mealCount = 1): WeeklyProgressDay {
	return makeDay({ localDate, dailyScore, hasReport: true, mealCount });
}

describe("buildWeekSummary", () => {
	test("returns honest empty copy when no day has a check-in", () => {
		// Arrange
		const days = [makeDay({ localDate: "2026-06-22" }), makeDay({ localDate: "2026-06-23" })];

		// Act
		const summary = buildWeekSummary(days);

		// Assert
		expect(summary.headline).toBe("No check-ins yet");
		expect(summary.band).toBeUndefined();
		expect(summary.deltaLine).toBeUndefined();
	});

	test("mentions logged meals when scans exist but nothing is scored", () => {
		const days = [makeDay({ localDate: "2026-06-22", mealCount: 2 })];

		const summary = buildWeekSummary(days);

		expect(summary.detail).toContain("check-in");
	});

	test("calls an all-calm week a calm week", () => {
		const days = [scoredDay("2026-06-22", 80), scoredDay("2026-06-23", 72)];

		const summary = buildWeekSummary(days);

		expect(summary.headline).toBe("A calm week");
		expect(summary.band).toBe("calm");
		expect(summary.detail).toContain("2 calm days");
	});

	test("calls a calm-majority week mostly calm and counts every band", () => {
		const days = [
			scoredDay("2026-06-22", 80),
			scoredDay("2026-06-23", 72),
			scoredDay("2026-06-24", 90),
			scoredDay("2026-06-25", 50),
			scoredDay("2026-06-26", 20),
		];

		const summary = buildWeekSummary(days);

		expect(summary.headline).toBe("Mostly calm");
		expect(summary.band).toBe("calm");
		expect(summary.detail).toContain("3 calm days");
		expect(summary.detail).toContain("1 mixed");
		expect(summary.detail).toContain("1 rough");
	});

	test("calls a rough-majority week mostly rough", () => {
		const days = [
			scoredDay("2026-06-22", 10),
			scoredDay("2026-06-23", 20),
			scoredDay("2026-06-24", 25),
			scoredDay("2026-06-25", 80),
		];

		const summary = buildWeekSummary(days);

		expect(summary.headline).toBe("Mostly rough");
		expect(summary.band).toBe("rough");
	});

	test("falls back to a mixed week when no band dominates", () => {
		const days = [
			scoredDay("2026-06-22", 80),
			scoredDay("2026-06-23", 50),
			scoredDay("2026-06-24", 20),
		];

		const summary = buildWeekSummary(days);

		expect(summary.headline).toBe("A mixed week");
		expect(summary.band).toBe("mixed");
	});

	test("counts unlogged days honestly", () => {
		const days = [scoredDay("2026-06-22", 80), makeDay({ localDate: "2026-06-23" })];

		const summary = buildWeekSummary(days);

		expect(summary.detail).toContain("1 day without a check-in");
	});

	test("reports the week's score movement when at least two days are scored", () => {
		const days = [scoredDay("2026-06-22", 70), scoredDay("2026-06-23", 76)];

		const summary = buildWeekSummary(days);

		expect(summary.deltaLine).toContain("6 points higher");
	});

	test("omits the delta line with a single scored day", () => {
		const days = [scoredDay("2026-06-22", 70)];

		const summary = buildWeekSummary(days);

		expect(summary.deltaLine).toBeUndefined();
	});

	test("reports a downward week without sugarcoating", () => {
		const days = [scoredDay("2026-06-22", 80), scoredDay("2026-06-23", 60)];

		const summary = buildWeekSummary(days);

		expect(summary.deltaLine).toContain("20 points lower");
	});
});

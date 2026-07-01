import { describe, expect, test } from "vitest";

import { buildDayStory } from "../dayStory";
import { DailyGutReport, ScanHistorySummary } from "../../../types/domain";
import { WeeklyProgressDay } from "../../../utils/weeklyProgress";

function makeScan(overrides: Partial<ScanHistorySummary> = {}): ScanHistorySummary {
	return {
		id: "scan-1",
		sourceType: "photo",
		scanCategory: "food",
		analysisStatus: "completed",
		tokenCost: 0,
		createdAt: "2026-06-22T12:00:00.000Z",
		dishName: "Taco bowl",
		overallRiskScore: 62,
		overallRiskLevel: "medium",
		...overrides,
	} as ScanHistorySummary;
}

function makeReport(overrides: Partial<DailyGutReport> = {}): DailyGutReport {
	return {
		id: "report-1",
		userId: "user-1",
		localDate: "2026-06-22",
		gutSeverity: 3,
		symptomTags: [],
		createdAt: "2026-06-22T20:00:00.000Z",
		updatedAt: "2026-06-22T20:00:00.000Z",
		...overrides,
	};
}

function makeDay(overrides: Partial<WeeklyProgressDay> = {}): WeeklyProgressDay {
	return {
		localDate: "2026-06-22",
		weekdayLabel: "M",
		mealCount: 0,
		hasReport: false,
		trendDirection: "none",
		scans: [],
		...overrides,
	};
}

describe("buildDayStory", () => {
	test("names a rough day and points at the riskiest scan", () => {
		// Arrange
		const day = makeDay({
			mealCount: 2,
			hasReport: true,
			dailyScore: 20,
			scans: [
				makeScan({ id: "a", dishName: "Garden salad", overallRiskScore: 12, overallRiskLevel: "low" }),
				makeScan({ id: "b", dishName: "Taco bowl", overallRiskScore: 62, overallRiskLevel: "medium" }),
			],
			report: makeReport({ gutSeverity: 8, symptomTags: ["Bloating"] }),
		});

		// Act
		const story = buildDayStory(day);

		// Assert
		expect(story.headline).toBe("Rough day");
		expect(story.band).toBe("rough");
		expect(story.story).toContain("bloating");
		expect(story.story).toContain("Taco bowl");
		expect(story.story).toContain("medium risk");
	});

	test("credits gentle meals on a calm day", () => {
		const day = makeDay({
			mealCount: 1,
			hasReport: true,
			dailyScore: 82,
			scans: [makeScan({ dishName: "Rice bowl", overallRiskScore: 8, overallRiskLevel: "low" })],
			report: makeReport({ gutSeverity: 1 }),
		});

		const story = buildDayStory(day);

		expect(story.headline).toBe("Calm day");
		expect(story.band).toBe("calm");
		expect(story.story.toLowerCase()).toContain("gentle");
	});

	test("is honest when symptoms were tagged but no meals were scanned", () => {
		const day = makeDay({
			hasReport: true,
			dailyScore: 40,
			report: makeReport({ gutSeverity: 5, symptomTags: ["Cramping"] }),
		});

		const story = buildDayStory(day);

		expect(story.headline).toBe("Mixed day");
		expect(story.story).toContain("cramping");
		expect(story.story.toLowerCase()).toContain("no meals");
	});

	test("asks for the check-in when only meals exist", () => {
		const day = makeDay({ mealCount: 2, scans: [makeScan(), makeScan({ id: "c" })] });

		const story = buildDayStory(day);

		expect(story.headline).toBe("Waiting on your check-in");
		expect(story.band).toBeUndefined();
	});

	test("says nothing was logged when the day is empty", () => {
		const story = buildDayStory(makeDay());

		expect(story.headline).toBe("Nothing logged yet");
		expect(story.band).toBeUndefined();
	});

	test("adds a trigger-evidence note only when a scored day has meals", () => {
		const scoredWithMeals = makeDay({
			mealCount: 1,
			hasReport: true,
			dailyScore: 82,
			scans: [makeScan({ overallRiskLevel: "low", overallRiskScore: 10 })],
			report: makeReport({ gutSeverity: 1 }),
		});
		const scoredWithoutMeals = makeDay({
			hasReport: true,
			dailyScore: 82,
			report: makeReport({ gutSeverity: 1 }),
		});

		expect(buildDayStory(scoredWithMeals).profileNote).toContain("calm evidence");
		expect(buildDayStory(scoredWithoutMeals).profileNote).toBeUndefined();
	});
});

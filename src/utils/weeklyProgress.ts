import { DailyGutReport, ScanHistorySummary } from "../types/domain";

export type WeeklyProgressTrendDirection = "up" | "down" | "flat" | "none";

export type WeeklyProgressDay = {
	localDate: string;
	weekdayLabel: string;
	mealCount: number;
	hasReport: boolean;
	dailyScore?: number;
	trendDirection: WeeklyProgressTrendDirection;
	trendDelta?: number;
	scans: ScanHistorySummary[];
	report?: DailyGutReport;
};

type BuildWeeklyProgressDaysParams = {
	scans: ScanHistorySummary[];
	reports: DailyGutReport[];
	weekStart?: string;
	anchorDate?: Date;
};

type BuildWeeklyProgressDayParams = {
	scans: ScanHistorySummary[];
	reports: DailyGutReport[];
	localDate: string;
};

const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

export function buildWeeklyProgressDays({
	scans,
	reports,
	weekStart,
	anchorDate = new Date(),
}: BuildWeeklyProgressDaysParams): WeeklyProgressDay[] {
	const startDate = weekStart ? parseLocalDate(weekStart) : getMondayWeekStart(anchorDate);
	const foodScansByDate = groupFoodScansByLocalDate(scans);
	const reportsByDate = groupReportsByLocalDate(reports);
	const days = weekdayLabels.map<WeeklyProgressDay>((weekdayLabel, index) => {
		const localDate = toLocalDate(addDays(startDate, index));
		const report = reportsByDate.get(localDate);
		const dayScans = foodScansByDate.get(localDate) ?? [];
		const dailyScore = report ? dailyScoreValue(report) : undefined;

		return {
			localDate,
			weekdayLabel,
			mealCount: dayScans.length,
			hasReport: Boolean(report),
			dailyScore,
			trendDirection: "none",
			scans: dayScans,
			report,
		};
	});

	return withDailyScoreTrends(days);
}

export function createMockWeeklyProgressDays(): WeeklyProgressDay[] {
	const weekStart = getMondayWeekStart(new Date());
	const mockScores: (number | undefined)[] = [82, 75, 71, 80, 66, 76, undefined];
	const mockMeals = [1, 1, 1, 1, 1, 1, 0];

	return withDailyScoreTrends(
		weekdayLabels.map((weekdayLabel, index) => {
			const score = mockScores[index];
			const localDate = toLocalDate(addDays(weekStart, index));

			return {
				localDate,
				weekdayLabel,
				mealCount: mockMeals[index] ?? 0,
				hasReport: score !== undefined,
				dailyScore: score,
				trendDirection: "none",
				scans: [],
				report: undefined,
			};
		})
	);
}

export function createMockFeaturedDailyScoreDay(): WeeklyProgressDay {
	const localDate = yesterdayLocalDate();
	const timestamp = `${localDate}T12:00:00.000Z`;

	return {
		localDate,
		weekdayLabel: parseLocalDate(localDate).toLocaleDateString(undefined, {
			weekday: "short",
		})[0] ?? "Y",
		mealCount: 3,
		hasReport: true,
		dailyScore: 76,
		trendDirection: "none",
		scans: [],
		report: {
			id: "mock-yesterday-report",
			userId: "mock-user",
			localDate,
			gutSeverity: 3,
			dailyScore: 76,
			symptomTags: ["Mild bloating"],
			createdAt: timestamp,
			updatedAt: timestamp,
		},
	};
}

export function buildWeeklyProgressDay({
	scans,
	reports,
	localDate,
}: BuildWeeklyProgressDayParams): WeeklyProgressDay {
	const foodScans = scans.filter(
		(scan) => (scan.scanCategory ?? "food") === "food" && localDateFromScan(scan) === localDate
	);
	const reportsByDate = groupReportsByLocalDate(reports);
	const report = reportsByDate.get(localDate);

	return {
		localDate,
		weekdayLabel:
			parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: "short" })[0] ??
			"",
		mealCount: foodScans.length,
		hasReport: Boolean(report),
		dailyScore: report ? dailyScoreValue(report) : undefined,
		trendDirection: "none",
		scans: foodScans,
		report,
	};
}

export function getCurrentWeekStart(anchorDate = new Date()) {
	return toLocalDate(getMondayWeekStart(anchorDate));
}

export function getMondayWeekStart(date: Date) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const offsetFromMonday = (start.getDay() + 6) % 7;
	start.setDate(start.getDate() - offsetFromMonday);
	return start;
}

export function getAvailableWeekStarts(
	scans: ScanHistorySummary[],
	reports: DailyGutReport[],
	anchorDate = new Date()
) {
	const starts = new Set<string>([getCurrentWeekStart(anchorDate)]);

	for (const scan of scans) {
		if ((scan.scanCategory ?? "food") !== "food") continue;
		starts.add(getWeekStartForLocalDate(localDateFromScan(scan)));
	}

	for (const report of reports) {
		starts.add(getWeekStartForLocalDate(report.localDate));
	}

	return Array.from(starts).sort((left, right) => right.localeCompare(left));
}

export function formatWeekRange(weekStart: string) {
	const start = parseLocalDate(weekStart);
	const end = addDays(start, 6);
	const startMonth = start.toLocaleDateString(undefined, { month: "short" });
	const endMonth = end.toLocaleDateString(undefined, { month: "short" });
	const startDay = start.getDate();
	const endDay = end.getDate();

	if (startMonth === endMonth) {
		return `${startMonth} ${startDay}-${endDay}`;
	}

	return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

export function weeklyScoreDelta(days: WeeklyProgressDay[]) {
	const scoredDays = days.filter((day) => day.dailyScore !== undefined);
	if (scoredDays.length < 2) return 0;

	const first = scoredDays[0]?.dailyScore ?? 0;
	const latest = scoredDays[scoredDays.length - 1]?.dailyScore ?? 0;
	return latest - first;
}

export function getFeaturedDailyScoreDay(
	days: WeeklyProgressDay[],
	preferredLocalDate?: string
) {
	if (preferredLocalDate) {
		const preferredDay = days.find((day) => day.localDate === preferredLocalDate);
		if (preferredDay) {
			return preferredDay;
		}
	}

	const scoredDays = days.filter(
		(day) => day.hasReport && day.dailyScore !== undefined
	);
	return scoredDays[scoredDays.length - 1] ?? days[days.length - 1] ?? days[0];
}

export function yesterdayLocalDate(anchorDate = new Date()) {
	return toLocalDate(addDays(anchorDate, -1));
}

export function dailyScoreValue(report: DailyGutReport) {
	return report.dailyScore ?? dailyScoreFromSeverity(report.gutSeverity);
}

export function dailyScoreFromSeverity(gutSeverity: number) {
	const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
	return Math.max(0, Math.min(100, Math.round(90 - severity * 8)));
}

export function dailyScoreZoneColor(value: number) {
	if (value >= 67) return "low" as const;
	if (value >= 34) return "medium" as const;
	return "high" as const;
}

export function toLocalDate(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? new Date().getFullYear(), (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number) {
	const nextDate = new Date(date);
	nextDate.setDate(nextDate.getDate() + days);
	return nextDate;
}

export function formatDayTitle(localDate: string) {
	return parseLocalDate(localDate).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

export function formatMonthDay(localDate: string) {
	return parseLocalDate(localDate).toLocaleDateString(undefined, {
		month: "long",
		day: "numeric",
	});
}

function withDailyScoreTrends(days: WeeklyProgressDay[]) {
	let previousScore: number | undefined;

	return days.map((day) => {
		if (day.dailyScore === undefined) {
			return day;
		}

		if (previousScore === undefined) {
			previousScore = day.dailyScore;
			return day;
		}

		const delta = day.dailyScore - previousScore;
		previousScore = day.dailyScore;
		const trendDirection: WeeklyProgressTrendDirection =
			delta > 0 ? "up" : delta < 0 ? "down" : "flat";

		return {
			...day,
			trendDelta: delta,
			trendDirection,
		};
	});
}

function groupFoodScansByLocalDate(scans: ScanHistorySummary[]) {
	const byDate = new Map<string, ScanHistorySummary[]>();

	for (const scan of scans) {
		if ((scan.scanCategory ?? "food") !== "food") continue;
		const localDate = localDateFromScan(scan);
		const current = byDate.get(localDate) ?? [];
		current.push(scan);
		byDate.set(localDate, current);
	}

	return byDate;
}

function groupReportsByLocalDate(reports: DailyGutReport[]) {
	const byDate = new Map<string, DailyGutReport>();

	for (const report of reports) {
		const existing = byDate.get(report.localDate);
		if (!existing || new Date(report.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
			byDate.set(report.localDate, report);
		}
	}

	return byDate;
}

function localDateFromScan(scan: ScanHistorySummary) {
	if (scan.localDate) return scan.localDate;
	return toLocalDate(new Date(scan.completedAt ?? scan.createdAt));
}

export function getWeekStartForLocalDate(localDate: string) {
	return toLocalDate(getMondayWeekStart(parseLocalDate(localDate)));
}

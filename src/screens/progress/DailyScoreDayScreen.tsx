import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard } from "../../components/common/UI";
import { useHistoryFeed } from "../../features/history/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { radii, spacing, tokens, type } from "../../theme";
import { ScanRecord } from "../../types/domain";
import {
	WeeklyProgressDay,
	buildWeeklyProgressDays,
	formatDayTitle,
	getWeekStartForLocalDate,
} from "../../utils/weeklyProgress";

type Props = NativeStackScreenProps<RootStackParamList, "DailyScoreDay">;

export function DailyScoreDayScreen({ navigation, route }: Props) {
	const { localDate } = route.params;
	const weekStart = route.params.weekStart ?? getWeekStartForLocalDate(localDate);
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackReports = useAppStore((state) => state.dailyReports);
	const historyQuery = useHistoryFeed(100);
	const scans = historyQuery.data?.pages.flatMap((page) => page.scans ?? []) ?? fallbackScans;
	const reports =
		historyQuery.data?.pages.flatMap((page) => page.dailyReports ?? []) ?? fallbackReports;
	const day = useMemo(
		() =>
			buildWeeklyProgressDays({ scans, reports, weekStart }).find(
				(entry) => entry.localDate === localDate
			) ?? emptyDay(localDate),
		[localDate, reports, scans, weekStart]
	);

	function openReport() {
		trackEvent("daily_gut_report_opened", {
			entry_point: "daily_score_day",
			local_date: localDate,
		});
		navigation.navigate("DailyGutReport", { localDate });
	}

	return (
		<AppScreen>
			<ScreenHeader
				eyebrow={formatDayTitle(localDate)}
				title="Daily recap"
				subtitle="Meals, symptoms, and the Daily Score for this day."
			/>

			<DailyScoreSummary day={day} onReportPress={openReport} />

			<SectionCard style={styles.sectionCard}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>Meals logged</Text>
					<Text style={styles.sectionMeta}>{day.mealCount}</Text>
				</View>
				{day.scans.length ? (
					<View style={styles.mealList}>
						{day.scans.map((scan) => (
							<MealRow
								key={scan.id}
								scan={scan}
								onPress={() => navigation.navigate("ScanResult", { scanId: scan.id })}
							/>
						))}
					</View>
				) : (
					<Text style={styles.emptyCopy}>No meals were logged for this day.</Text>
				)}
			</SectionCard>

			<SectionCard style={styles.sectionCard}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>Symptoms</Text>
					<Pressable
						accessibilityRole="button"
						onPress={openReport}
						style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.78 }]}
					>
						<Text style={styles.editButtonText}>{day.report ? "Edit" : "Add"}</Text>
					</Pressable>
				</View>
				{day.report ? (
					<View style={styles.symptomStack}>
						<View style={styles.symptomSeverityRow}>
							<Text style={styles.symptomLabel}>Gut severity</Text>
							<Text style={styles.symptomValue}>{day.report.gutSeverity}/10</Text>
						</View>
						<Text style={styles.symptomBody}>
							{day.report.symptomTags.length
								? day.report.symptomTags.join(", ")
								: "No symptoms tagged."}
						</Text>
						{day.report.notes ? (
							<Text style={styles.notesText}>{day.report.notes}</Text>
						) : null}
					</View>
				) : (
					<View style={styles.noReportStack}>
						<Text style={styles.emptyCopy}>
							No gut report was logged for this day yet.
						</Text>
						<PrimaryButton label="Log this day" onPress={openReport} />
					</View>
				)}
			</SectionCard>
		</AppScreen>
	);
}

function DailyScoreSummary({
	day,
	onReportPress,
}: {
	day: WeeklyProgressDay;
	onReportPress: () => void;
}) {
	const hasScore = day.hasReport && day.dailyScore !== undefined;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const tone = score !== undefined ? scoreTone(score) : tokens.color.text.tertiary;

	return (
		<SectionCard style={styles.summaryCard}>
			<View style={styles.summaryCopy}>
				<Text style={styles.summaryLabel}>Daily Score</Text>
				<Text style={[styles.summaryScore, { color: tone }]}>
					{score !== undefined ? score : "—"}
					{score !== undefined ? <Text style={styles.summaryScale}>/100</Text> : null}
				</Text>
				<Text style={styles.summaryDetail}>
					{score !== undefined
						? "Based on the gut report and food exposure for this day."
						: day.mealCount
							? "Meals were logged, but this day still needs a gut report."
							: "No meals or gut report were logged for this day."}
				</Text>
			</View>
			<Pressable
				accessibilityRole="button"
				onPress={onReportPress}
				style={({ pressed }) => [styles.summaryAction, pressed && { opacity: 0.82 }]}
			>
				<Ionicons name="create-outline" size={18} color={tokens.color.icon.accent} />
				<Text style={styles.summaryActionText}>{day.report ? "Edit report" : "Add report"}</Text>
			</Pressable>
		</SectionCard>
	);
}

function MealRow({ scan, onPress }: { scan: ScanRecord; onPress: () => void }) {
	const tone = riskTone(scan.overallRiskLevel);

	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [styles.mealRow, pressed && { opacity: 0.9 }]}
		>
			<View style={styles.mealIcon}>
				<Ionicons name="restaurant-outline" size={18} color={tokens.color.icon.accent} />
			</View>
			<View style={styles.mealCopy}>
				<Text style={styles.mealTitle} numberOfLines={1}>
					{scan.dishName}
				</Text>
				<Text style={styles.mealMeta}>{scan.overallRiskLevel} risk</Text>
			</View>
			<View style={[styles.riskBadge, { borderColor: tone }]}>
				<Text style={[styles.riskBadgeText, { color: tone }]}>{scan.overallRiskScore}</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

function emptyDay(localDate: string): WeeklyProgressDay {
	return {
		localDate,
		weekdayLabel: formatDayTitle(localDate).slice(0, 1),
		mealCount: 0,
		hasReport: false,
		trendDirection: "none",
		scans: [],
	};
}

function scoreTone(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.foreground;
	if (score >= 34) return tokens.color.status.risk.medium.foreground;
	return tokens.color.status.risk.high.foreground;
}

function riskTone(level: ScanRecord["overallRiskLevel"]) {
	if (level === "high") return tokens.color.status.risk.high.tint;
	if (level === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

const styles = StyleSheet.create({
	summaryCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	summaryCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	summaryLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	summaryScore: {
		fontFamily: type.body.bold,
		fontSize: 60,
		lineHeight: 66,
		fontVariant: ["tabular-nums"],
	},
	summaryScale: {
		color: tokens.color.text.tertiary,
		fontSize: 20,
		lineHeight: 26,
	},
	summaryDetail: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
	},
	summaryAction: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	summaryActionText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	sectionCard: {
		gap: spacing.md,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	sectionTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	sectionMeta: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 14,
	},
	mealList: {
		gap: spacing.sm,
	},
	mealRow: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.warm,
		padding: spacing.sm,
	},
	mealIcon: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	mealCopy: {
		flex: 1,
		gap: 2,
	},
	mealTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	mealMeta: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "capitalize",
	},
	riskBadge: {
		width: 38,
		height: 38,
		borderRadius: 19,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.surface.card.default,
	},
	riskBadgeText: {
		fontFamily: type.body.bold,
		fontSize: 13,
	},
	editButton: {
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.md,
		paddingVertical: 7,
	},
	editButtonText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	symptomStack: {
		gap: spacing.sm,
	},
	symptomSeverityRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	symptomLabel: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 14,
	},
	symptomValue: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
	},
	symptomBody: {
		color: tokens.color.text.primary,
		fontFamily: type.body.medium,
		fontSize: 15,
		lineHeight: 22,
	},
	notesText: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 21,
	},
	noReportStack: {
		gap: spacing.md,
	},
	emptyCopy: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 21,
	},
});

import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppScreen, ScreenHeader } from "../../components/common/UI";
import { WeeklyProgressCard } from "../../components/progress/WeeklyProgressCard";
import { useHistoryFeed } from "../../features/history/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	WeeklyProgressDay,
	buildWeeklyProgressDay,
	buildWeeklyProgressDays,
	formatDayTitle,
	formatWeekRange,
	getAvailableWeekStarts,
	getCurrentWeekStart,
	getFeaturedDailyScoreDay,
	yesterdayLocalDate,
} from "../../utils/weeklyProgress";

export function WeeklyProgressScreen() {
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackReports = useAppStore((state) => state.dailyReports);
	const historyQuery = useHistoryFeed(100);
	const scans = historyQuery.data?.pages.flatMap((page) => page.scans ?? []) ?? fallbackScans;
	const reports =
		historyQuery.data?.pages.flatMap((page) => page.dailyReports ?? []) ?? fallbackReports;
	const weekStarts = useMemo(
		() => getAvailableWeekStarts(scans, reports),
		[reports, scans]
	);
	const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekStart());
	const days = useMemo(
		() => buildWeeklyProgressDays({ scans, reports, weekStart: selectedWeek }),
		[reports, scans, selectedWeek]
	);
	const currentWeekStart = getCurrentWeekStart();
	const featuredDay =
		selectedWeek === currentWeekStart
			? buildWeeklyProgressDay({
					scans,
					reports,
					localDate: yesterdayLocalDate(),
			  })
			: getFeaturedDailyScoreDay(days);

	useEffect(() => {
		trackEvent("weekly_progress_viewed", { week_start: selectedWeek });
	}, [selectedWeek]);

	return (
		<AppScreen>
			<ScreenHeader
				title="Weekly Progress"
				subtitle="Daily Score, meals, and symptoms by week."
			/>

			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.weekPicker}
			>
				{weekStarts.map((weekStart) => {
					const selected = weekStart === selectedWeek;
					return (
						<Pressable
							key={weekStart}
							accessibilityRole="button"
							onPress={() => setSelectedWeek(weekStart)}
							style={({ pressed }) => [
								styles.weekChip,
								selected && styles.weekChipSelected,
								pressed && { opacity: 0.82 },
							]}
						>
							<Text
								style={[
									styles.weekChipText,
									selected && styles.weekChipTextSelected,
								]}
							>
								{formatWeekRange(weekStart)}
							</Text>
						</Pressable>
					);
				})}
			</ScrollView>

			<WeeklyProgressCard
				days={days}
				mode="interactive"
				showChevron={false}
				featuredDay={featuredDay}
				featuredLabel={selectedWeek === currentWeekStart ? "Yesterday" : "Selected day"}
				onFeaturedMealsPress={(day) =>
					navigation.navigate("DailyScoreDay", {
						localDate: day.localDate,
						weekStart: selectedWeek,
					})
				}
				onFeaturedSymptomsPress={(day) =>
					navigation.navigate("DailyScoreDay", {
						localDate: day.localDate,
						weekStart: selectedWeek,
					})
				}
				subtitle={formatWeekRange(selectedWeek)}
			/>

			<View style={styles.listHeader}>
				<Text style={styles.sectionTitle}>Days this week</Text>
				<Text style={styles.sectionMeta}>Mon-Sun</Text>
			</View>

			<View style={styles.dayList}>
				{days.map((day) => (
					<WeekDayRow
						key={day.localDate}
						day={day}
						onPress={() =>
							navigation.navigate("DailyScoreDay", {
								localDate: day.localDate,
								weekStart: selectedWeek,
							})
						}
					/>
				))}
			</View>
		</AppScreen>
	);
}

function WeekDayRow({ day, onPress }: { day: WeeklyProgressDay; onPress: () => void }) {
	const hasScore = day.dailyScore !== undefined && day.hasReport;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const scoreColor = score !== undefined ? scoreTint(score) : tokens.color.text.tertiary;
	const symptomSummary = day.report?.symptomTags.length
		? day.report.symptomTags.slice(0, 2).join(", ")
		: day.report
			? "Report logged"
			: "No report";

	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [styles.dayRow, pressed && { opacity: 0.9 }]}
		>
			<View style={styles.dayDateBadge}>
				<Text style={styles.dayWeekday}>{day.weekdayLabel}</Text>
			</View>
			<View style={styles.dayCopy}>
				<Text style={styles.dayTitle}>{formatDayTitle(day.localDate)}</Text>
				<Text style={styles.dayMeta}>
					{day.mealCount ? `${day.mealCount} meal${day.mealCount === 1 ? "" : "s"}` : "No meals"} · {symptomSummary}
				</Text>
			</View>
			<View style={[styles.dayScorePill, score !== undefined && { backgroundColor: scoreBackground(score) }]}>
				<Text style={[styles.dayScoreText, { color: scoreColor }]}>
					{score !== undefined ? score : "—"}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

function scoreTint(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.foreground;
	if (score >= 34) return tokens.color.status.risk.medium.foreground;
	return tokens.color.status.risk.high.foreground;
}

function scoreBackground(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.background;
	if (score >= 34) return tokens.color.status.risk.medium.background;
	return tokens.color.status.risk.high.background;
}

const styles = StyleSheet.create({
	weekPicker: {
		gap: spacing.sm,
		paddingRight: spacing.md,
	},
	weekChip: {
		minHeight: 38,
		justifyContent: "center",
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
	},
	weekChipSelected: {
		borderColor: tokens.color.border.emphasis,
		backgroundColor: tokens.color.status.success.background,
	},
	weekChipText: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	weekChipTextSelected: {
		color: tokens.color.text.accent,
	},
	listHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	sectionTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 28,
	},
	sectionMeta: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
	},
	dayList: {
		gap: spacing.sm,
	},
	dayRow: {
		...components.card.default,
		minHeight: 86,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
	},
	dayDateBadge: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	dayWeekday: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
	},
	dayCopy: {
		flex: 1,
		gap: 3,
	},
	dayTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 21,
	},
	dayMeta: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
	dayScorePill: {
		minWidth: 44,
		alignItems: "center",
		borderRadius: radii.pill,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
	},
	dayScoreText: {
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
});

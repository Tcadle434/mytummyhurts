import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { AppScreen, DetailScreenHeader } from "../../components/common/UI";
import { WeeklyProgressCard } from "../../components/progress/WeeklyProgressCard";
import { useHomeData } from "../../features/home/hooks";
import { useHistoryFeed } from "../../features/history/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	WeeklyProgressDay,
	addDays,
	buildWeeklyProgressDay,
	buildWeeklyProgressDays,
	formatWeekRange,
	getCurrentWeekStart,
	getFeaturedDailyScoreDay,
	parseLocalDate,
	toLocalDate,
	yesterdayLocalDate,
} from "../../utils/weeklyProgress";
import { gutScoreTint } from "../../utils/risk";

export function WeeklyProgressScreen() {
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackReports = useAppStore((state) => state.dailyReports);
	const homeQuery = useHomeData();
	const historyQuery = useHistoryFeed(100);
	const scans =
		historyQuery.data?.pages.flatMap((page) => page.scans ?? []) ??
		homeQuery.data?.recentScans ??
		fallbackScans;
	const reports =
		historyQuery.data?.pages.flatMap((page) => page.dailyReports ?? []) ??
		homeQuery.data?.dailyReports ??
		fallbackReports;

	const currentWeekStart = useMemo(() => getCurrentWeekStart(), []);
	const todayLocalDate = useMemo(() => toLocalDate(new Date()), []);

	const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekStart());
	const isActiveWeek = selectedWeek === currentWeekStart;

	const orderedDays = useMemo(
		() => buildWeeklyProgressDays({ scans, reports, weekStart: selectedWeek }),
		[reports, scans, selectedWeek]
	);

	const visibleDays = useMemo(() => {
		const filtered = isActiveWeek
			? orderedDays.filter((day) => day.localDate <= todayLocalDate)
			: orderedDays;
		return [...filtered].reverse();
	}, [orderedDays, isActiveWeek, todayLocalDate]);

	const featuredDay = isActiveWeek
		? buildWeeklyProgressDay({
				scans,
				reports,
				localDate: yesterdayLocalDate(),
		  })
		: getFeaturedDailyScoreDay(orderedDays);

	const canGoOlder = true;
	const canGoNewer = selectedWeek < currentWeekStart;

	function goOlder() {
		setSelectedWeek((current) => toLocalDate(addDays(parseLocalDate(current), -7)));
	}

	function goNewer() {
		setSelectedWeek((current) => {
			if (current >= currentWeekStart) return current;
			const next = toLocalDate(addDays(parseLocalDate(current), 7));
			return next > currentWeekStart ? currentWeekStart : next;
		});
	}

	useEffect(() => {
		trackEvent("weekly_progress_viewed", { week_start: selectedWeek });
	}, [selectedWeek]);

	return (
		<AppScreen>
			<DetailScreenHeader
				eyebrow="Daily Score"
				title={formatWeekRange(selectedWeek)}
				titleAccessory={
					<WeekStepper
						onOlder={goOlder}
						onNewer={goNewer}
						canGoOlder={canGoOlder}
						canGoNewer={canGoNewer}
					/>
				}
			/>

			<WeeklyProgressCard
				days={orderedDays}
				mode="interactive"
				showChevron={false}
				featuredDay={featuredDay}
				featuredLabel={isActiveWeek ? "Yesterday" : "Selected day"}
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
			/>

			<View style={styles.dayList}>
				{visibleDays.map((day) => (
					<WeekDayRow
						key={day.localDate}
						day={day}
						isToday={isActiveWeek && day.localDate === todayLocalDate}
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

function WeekStepper({
	onOlder,
	onNewer,
	canGoOlder,
	canGoNewer,
}: {
	onOlder: () => void;
	onNewer: () => void;
	canGoOlder: boolean;
	canGoNewer: boolean;
}) {
	return (
		<View style={styles.stepperRow}>
			<StepperButton
				direction="back"
				disabled={!canGoOlder}
				onPress={onOlder}
				accessibilityLabel="Previous week"
			/>
			<StepperButton
				direction="forward"
				disabled={!canGoNewer}
				onPress={onNewer}
				accessibilityLabel="Next week"
			/>
		</View>
	);
}

function StepperButton({
	direction,
	disabled,
	onPress,
	accessibilityLabel,
}: {
	direction: "back" | "forward";
	disabled: boolean;
	onPress: () => void;
	accessibilityLabel: string;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled }}
			disabled={disabled}
			onPress={onPress}
			hitSlop={6}
			style={({ pressed }) => [
				styles.stepperButton,
				disabled && styles.stepperButtonDisabled,
				pressed && !disabled && { opacity: 0.7 },
			]}
		>
			<Ionicons
				name={direction === "back" ? "chevron-back" : "chevron-forward"}
				size={18}
				color={disabled ? tokens.color.icon.muted : tokens.color.icon.primary}
			/>
		</Pressable>
	);
}

function WeekDayRow({
	day,
	isToday,
	onPress,
}: {
	day: WeeklyProgressDay;
	isToday: boolean;
	onPress: () => void;
}) {
	const hasScore = day.dailyScore !== undefined && day.hasReport;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const scoreColor = score !== undefined ? gutScoreTint(score) : tokens.color.text.tertiary;
	const symptomSummary = day.report?.symptomTags.length
		? day.report.symptomTags.slice(0, 2).join(", ")
		: day.report
			? "Report logged"
			: "No report";

	const rowScale = useSharedValue(1);
	const pillScale = useSharedValue(1);

	const rowAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: rowScale.value }],
	}));

	const pillAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: pillScale.value }],
	}));

	function handlePressIn() {
		rowScale.value = withSpring(0.97, { damping: 18, stiffness: 360, mass: 0.6 });
	}

	function handlePressOut() {
		rowScale.value = withSpring(1, { damping: 16, stiffness: 220, mass: 0.7 });
	}

	function handlePress() {
		pillScale.value = withSequence(
			withTiming(1.18, { duration: 120 }),
			withTiming(1, { duration: 160 })
		);
		onPress();
	}

	return (
		<Animated.View style={rowAnimatedStyle}>
			<Pressable
				accessibilityRole="button"
				onPressIn={handlePressIn}
				onPressOut={handlePressOut}
				onPress={handlePress}
				style={styles.dayRow}
			>
				<View
					style={[
						styles.dayDateBadge,
						{ backgroundColor: badgeColorForScore(score) },
						score === undefined && styles.dayDateBadgeEmpty,
					]}
				>
					<Text
						style={[
							styles.dayBadgeMonth,
							score === undefined && styles.dayBadgeTextEmpty,
						]}
					>
						{formatMonth(day.localDate)}
					</Text>
					<Text
						style={[
							styles.dayBadgeDay,
							score === undefined && styles.dayBadgeTextEmpty,
						]}
					>
						{formatDayOfMonth(day.localDate)}
					</Text>
				</View>
				<View style={styles.dayCopy}>
					<View style={styles.dayTitleRow}>
						<Text style={styles.dayTitle}>{formatWeekday(day.localDate)}</Text>
						{isToday ? (
							<View style={styles.todayPill}>
								<Text style={styles.todayPillText}>Today</Text>
							</View>
						) : null}
					</View>
					<Text style={styles.dayMeta}>
						{day.mealCount ? `${day.mealCount} meal${day.mealCount === 1 ? "" : "s"}` : "No meals"} · {symptomSummary}
					</Text>
				</View>
				<Animated.View
					style={[
						styles.dayScorePill,
						score !== undefined && { backgroundColor: scoreBackground(score) },
						pillAnimatedStyle,
					]}
				>
					<Text style={[styles.dayScoreText, { color: scoreColor }]}>
						{score !== undefined ? `${score}%` : "—"}
					</Text>
				</Animated.View>
				<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
			</Pressable>
		</Animated.View>
	);
}

function scoreBackground(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.background;
	if (score >= 34) return tokens.color.status.risk.medium.background;
	return tokens.color.status.risk.high.background;
}

function badgeColorForScore(score: number | undefined) {
	if (score === undefined) return tokens.color.surface.card.warm;
	if (score >= 67) return tokens.color.status.risk.low.tint;
	if (score >= 34) return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.high.tint;
}

function formatMonth(localDate: string) {
	return parseLocalDate(localDate)
		.toLocaleDateString(undefined, { month: "short" })
		.toUpperCase();
}

function formatDayOfMonth(localDate: string) {
	return String(parseLocalDate(localDate).getDate());
}

function formatWeekday(localDate: string) {
	return parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: "long" });
}

const styles = StyleSheet.create({
	stepperRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	stepperButton: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.surface.frosted,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
	},
	stepperButtonDisabled: {
		opacity: 0.6,
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
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
		paddingTop: 4,
		paddingBottom: 5,
	},
	dayDateBadgeEmpty: {
		borderWidth: 1,
		borderColor: tokens.color.border.strong,
	},
	dayBadgeMonth: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 9,
		lineHeight: 11,
		letterSpacing: 0.6,
	},
	dayBadgeDay: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 22,
		fontVariant: ["tabular-nums"],
		letterSpacing: -0.3,
	},
	dayBadgeTextEmpty: {
		color: tokens.color.text.tertiary,
	},
	dayCopy: {
		flex: 1,
		gap: 3,
	},
	dayTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	dayTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 21,
	},
	todayPill: {
		paddingHorizontal: spacing.xs,
		paddingVertical: 2,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.success.background,
	},
	todayPillText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.4,
		textTransform: "uppercase",
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

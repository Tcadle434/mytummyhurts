import { Ionicons } from "@expo/vector-icons";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	FadeIn,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { Pip } from "../../components/common/Pip";
import { AppScreen, DetailScreenHeader } from "../../components/common/UI";
import { bandRiskColors, pipStateForBand } from "../../components/progress/bandStyle";
import { useHomeData } from "../../features/home/hooks";
import { useHistoryFeed } from "../../features/history/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	DailyScoreBand,
	WeeklyProgressDay,
	addDays,
	buildWeeklyProgressDays,
	dailyScoreBand,
	formatWeekRange,
	getCurrentWeekStart,
	parseLocalDate,
	toLocalDate,
} from "../../utils/weeklyProgress";
import { buildWeekSummary } from "./weekSummary";

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

	// Only the days that have actually happened count toward the week's story.
	const elapsedDays = useMemo(
		() =>
			isActiveWeek
				? orderedDays.filter((day) => day.localDate <= todayLocalDate)
				: orderedDays,
		[orderedDays, isActiveWeek, todayLocalDate]
	);

	const visibleDays = useMemo(() => [...elapsedDays].reverse(), [elapsedDays]);
	const weekSummary = useMemo(() => buildWeekSummary(elapsedDays), [elapsedDays]);

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
			<DetailScreenHeader eyebrow="Weekly progress" />

			<View style={styles.weekRow}>
				<Text style={styles.weekRangeLabel}>{formatWeekRange(selectedWeek)}</Text>
				<WeekStepper
					onOlder={goOlder}
					onNewer={goNewer}
					canGoOlder={canGoOlder}
					canGoNewer={canGoNewer}
				/>
			</View>

			<Animated.View key={selectedWeek} entering={FadeIn.duration(260)}>
				<WeekHero
					headline={weekSummary.headline}
					detail={weekSummary.detail}
					deltaLine={weekSummary.deltaLine}
					band={weekSummary.band}
				/>
			</Animated.View>

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

/**
 * The screen's one evergreen block: the week spoken as a finding in on-hero
 * text, with Pip's face carrying the band (words + face; the day rows below
 * carry the band colors).
 */
function WeekHero({
	headline,
	detail,
	deltaLine,
	band,
}: {
	headline: string;
	detail: string;
	deltaLine?: string;
	band?: DailyScoreBand;
}) {
	return (
		<View style={styles.heroCard} accessible accessibilityRole="summary">
			<Pip state={pipStateForBand(band)} size={72} />
			<View style={styles.heroCopy}>
				<Text style={styles.heroHeadline}>{headline}</Text>
				<Text style={styles.heroDetail}>{detail}</Text>
				{deltaLine ? <Text style={styles.heroDelta}>{deltaLine}</Text> : null}
			</View>
		</View>
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
	const symptomSummary = day.report?.symptomTags.length
		? day.report.symptomTags.slice(0, 2).join(", ")
		: day.report
			? "Report logged"
			: "No report";
	const mealSummary = day.mealCount
		? `${day.mealCount} meal${day.mealCount === 1 ? "" : "s"}`
		: "No meals";

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
				accessibilityLabel={dayRowAccessibilityLabel(day, score, mealSummary)}
				onPressIn={handlePressIn}
				onPressOut={handlePressOut}
				onPress={handlePress}
				style={styles.dayRow}
			>
				<View style={styles.dayDateBadge}>
					<Text style={styles.dayBadgeDay}>{formatDayOfMonth(day.localDate)}</Text>
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
						{mealSummary} · {symptomSummary}
					</Text>
				</View>
				<Animated.View
					style={[
						styles.dayScorePill,
						score !== undefined && {
							backgroundColor: bandRiskColors(score).background,
						},
						pillAnimatedStyle,
					]}
				>
					<Text
						style={[
							styles.dayScoreText,
							{
								color:
									score !== undefined
										? bandRiskColors(score).foreground
										: tokens.color.text.tertiary,
							},
						]}
					>
						{score !== undefined ? `${score}% · ${dailyScoreBand(score)}` : "—"}
					</Text>
				</Animated.View>
				<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
			</Pressable>
		</Animated.View>
	);
}

function dayRowAccessibilityLabel(
	day: WeeklyProgressDay,
	score: number | undefined,
	mealSummary: string
) {
	const scorePart =
		score !== undefined
			? `Daily Score ${score} percent, ${dailyScoreBand(score)} day`
			: "no check-in yet";
	return `${formatWeekday(day.localDate)}, ${scorePart}, ${mealSummary}`;
}

function formatDayOfMonth(localDate: string) {
	return String(parseLocalDate(localDate).getDate());
}

function formatWeekday(localDate: string) {
	return parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: "long" });
}

const styles = StyleSheet.create({
	weekRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	weekRangeLabel: {
		...tokens.type.body.strong,
		color: tokens.color.text.secondary,
	},
	stepperRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	stepperButton: {
		width: 34,
		height: 34,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.surface.card.default,
		...tokens.shadow.card,
	},
	stepperButtonDisabled: {
		opacity: 0.6,
	},
	heroCard: {
		...components.card.hero,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.lg,
	},
	heroCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	// display.section, not display.hero: the copy column sits beside a 72px
	// Pip, and the wider Bricolage metrics need the smaller size to wrap well.
	heroHeadline: {
		...tokens.type.display.section,
		color: tokens.color.surface.hero.onHero,
	},
	heroDetail: {
		...tokens.type.body.default,
		fontFamily: type.body.medium,
		color: tokens.color.surface.hero.onHeroMuted,
	},
	heroDelta: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.surface.hero.onHeroFaint,
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
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.surface.app.default,
	},
	dayBadgeDay: {
		...tokens.type.metric.value,
		color: tokens.color.text.primary,
		fontVariant: ["tabular-nums"],
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
		...tokens.type.body.strong,
		color: tokens.color.text.primary,
	},
	todayPill: {
		paddingHorizontal: spacing.xs,
		paddingVertical: 2,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.success.background,
	},
	todayPillText: {
		...tokens.type.label.tab,
		fontFamily: type.body.bold,
		color: tokens.color.status.success.foreground,
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
	dayMeta: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
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
		...tokens.type.label.chip,
		fontFamily: type.body.bold,
	},
});

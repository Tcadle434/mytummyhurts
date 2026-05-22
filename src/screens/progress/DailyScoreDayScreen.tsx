import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeInDown,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { DailyScoreRing, scoreTint } from "../../components/progress/DailyScoreRing";
import {
	AppScreen,
	DetailScreenHeader,
	PrimaryButton,
	SectionCard,
} from "../../components/common/UI";
import { useHistoryFeed } from "../../features/history/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { radii, spacing, tokens, type } from "../../theme";
import { ScanHistorySummary } from "../../types/domain";
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

	function openAddMeal() {
		trackEvent("manual_meal_opened", {
			entry_point: "daily_score_day",
			local_date: localDate,
		});
		navigation.navigate("ManualMeal", {});
	}

	function openScan(scan: ScanHistorySummary) {
		navigation.navigate("ScanResult", { scanId: scan.id });
	}

	return (
		<AppScreen>
			<DetailScreenHeader eyebrow="Daily Score" title={formatDayTitle(localDate)} />

			<Animated.View entering={FadeIn.duration(280)}>
				<DailyScoreHero day={day} />
			</Animated.View>

			<Animated.View entering={FadeInDown.duration(320).delay(120)}>
				<SectionCard style={styles.sectionCard}>
					<View style={styles.sectionHeader}>
						<View style={styles.sectionTitleStack}>
							<Text style={styles.sectionTitle}>Meals</Text>
							<Text style={styles.sectionMeta}>
								{day.mealCount} {day.mealCount === 1 ? "logged" : "logged"}
							</Text>
						</View>
						<SectionEditButton label="Add" onPress={openAddMeal} />
					</View>
					{day.scans.length ? (
						<View style={styles.mealList}>
							{day.scans.map((scan) => (
								<MealRow
									key={scan.id}
									scan={scan}
									onPress={() => openScan(scan)}
								/>
							))}
						</View>
					) : (
						<Text style={styles.emptyCopy}>No meals were logged for this day.</Text>
					)}
				</SectionCard>
			</Animated.View>

			<Animated.View entering={FadeInDown.duration(320).delay(200)}>
				<SectionCard style={styles.sectionCard}>
					<View style={styles.sectionHeader}>
						<View style={styles.sectionTitleStack}>
							<Text style={styles.sectionTitle}>Symptoms</Text>
							{day.report ? (
								<Text style={styles.sectionMeta}>
									Severity {day.report.gutSeverity}/10
								</Text>
							) : (
								<Text style={styles.sectionMeta}>Not logged</Text>
							)}
						</View>
						<SectionEditButton
							label={day.report ? "Edit" : "Add"}
							onPress={openReport}
						/>
					</View>
					{day.report ? (
						<View style={styles.symptomStack}>
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
			</Animated.View>
		</AppScreen>
	);
}

function DailyScoreHero({ day }: { day: WeeklyProgressDay }) {
	const hasScore = day.hasReport && day.dailyScore !== undefined;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const tone = score !== undefined ? scoreTint(score) : tokens.color.text.tertiary;
	const ringScale = useSharedValue(0.7);
	const ringOpacity = useSharedValue(0);

	useEffect(() => {
		ringScale.value = withDelay(60, withSpring(1, { damping: 14, stiffness: 180, mass: 0.7 }));
		ringOpacity.value = withDelay(
			60,
			withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })
		);
	}, [ringOpacity, ringScale]);

	const ringAnimatedStyle = useAnimatedStyle(() => ({
		opacity: ringOpacity.value,
		transform: [{ scale: ringScale.value }],
	}));

	return (
		<SectionCard style={styles.heroCard}>
			<Animated.View style={ringAnimatedStyle}>
				<DailyScoreRing score={score} size={156} strokeWidth={14} />
			</Animated.View>
			<View style={styles.heroCopy}>
				<Text style={[styles.heroVerdict, { color: tone }]}>{verdictForScore(score)}</Text>
				<Text style={styles.heroDescription}>{descriptionForDay(day)}</Text>
			</View>
		</SectionCard>
	);
}

function SectionEditButton({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			hitSlop={8}
			style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.78 }]}
		>
			<Ionicons name="add" size={14} color={tokens.color.text.accent} />
			<Text style={styles.editButtonText}>{label}</Text>
		</Pressable>
	);
}

function MealRow({ scan, onPress }: { scan: ScanHistorySummary; onPress: () => void }) {
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

function verdictForScore(score: number | undefined) {
	if (score === undefined) return "Awaiting report";
	if (score >= 67) return "Calm day";
	if (score >= 34) return "Mixed day";
	return "Reactive day";
}

function descriptionForDay(day: WeeklyProgressDay) {
	const hasScore = day.hasReport && day.dailyScore !== undefined;
	if (hasScore) {
		return "Based on meals and symptoms.";
	}
	if (day.mealCount) {
		return "Meals were logged, but need symptom report.";
	}
	return "Nothing was logged for this day.";
}

function riskTone(level: ScanHistorySummary["overallRiskLevel"]) {
	if (level === "high") return tokens.color.status.risk.high.tint;
	if (level === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

const styles = StyleSheet.create({
	heroCard: {
		alignItems: "center",
		paddingVertical: spacing.lg,
		gap: spacing.md,
	},
	heroCopy: {
		alignItems: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.md,
	},
	heroVerdict: {
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 26,
		letterSpacing: -0.3,
	},
	heroDescription: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
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
	sectionTitleStack: {
		flex: 1,
		gap: 2,
	},
	sectionTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	sectionMeta: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 17,
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
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
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

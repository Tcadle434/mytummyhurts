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

import { Pip } from "../../components/common/Pip";
import {
	AppScreen,
	DetailScreenHeader,
	PrimaryButton,
	SectionCard,
} from "../../components/common/UI";
import { bandForeground, pipStateForBand } from "../../components/progress/bandStyle";
import { DailyScoreRing } from "../../components/progress/DailyScoreRing";
import { SkeletonImage } from "../../components/common/SkeletonImage";
import { useHomeData } from "../../features/home/hooks";
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
import { riskLevelColors } from "../../utils/risk";
import { buildDayStory } from "./dayStory";

type Props = NativeStackScreenProps<RootStackParamList, "DailyScoreDay">;

export function DailyScoreDayScreen({ navigation, route }: Props) {
	const { localDate } = route.params;
	const weekStart = route.params.weekStart ?? getWeekStartForLocalDate(localDate);
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

	function openScan(scan: ScanHistorySummary) {
		navigation.navigate("ScanResult", { scanId: scan.id });
	}

	return (
		<AppScreen>
			<DetailScreenHeader eyebrow={formatDayTitle(localDate)} />

			<Animated.View entering={FadeIn.duration(280)}>
				<DailyScoreHero day={day} />
			</Animated.View>

			<Animated.View entering={FadeInDown.duration(320).delay(120)}>
				<SectionCard style={styles.sectionCard}>
					<View style={styles.sectionHeader}>
						<View style={styles.sectionTitleStack}>
							<Text style={styles.sectionTitle}>Meals</Text>
							<Text style={styles.sectionMeta}>
								{day.mealCount} {day.mealCount === 1 ? "meal logged" : "meals logged"}
							</Text>
						</View>
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
							{day.report.symptomTags.length ? (
								<View style={styles.symptomChipRow}>
									{day.report.symptomTags.map((tag) => (
										<View key={tag} style={styles.symptomChip}>
											<Text style={styles.symptomChipText}>{tag}</Text>
										</View>
									))}
								</View>
							) : (
								<Text style={styles.emptyCopy}>No symptoms tagged.</Text>
							)}
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

/**
 * The screen's one hero: the day spoken as a finding. Serif verdict, ring
 * numeral, Pip's face, and a one-sentence evidence story built from what was
 * actually logged.
 */
function DailyScoreHero({ day }: { day: WeeklyProgressDay }) {
	const hasScore = day.hasReport && day.dailyScore !== undefined;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const story = buildDayStory(day);
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
				<View style={styles.heroVerdictRow}>
					<Pip state={pipStateForBand(story.band)} size={44} />
					<Text style={[styles.heroVerdict, { color: bandForeground(story.band) }]}>
						{story.headline}
					</Text>
				</View>
				<Text style={styles.heroStory}>{story.story}</Text>
				{story.profileNote ? (
					<Text style={styles.heroProfileNote}>{story.profileNote}</Text>
				) : null}
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
			<Ionicons name="add" size={14} color={tokens.color.action.quiet.foreground} />
			<Text style={styles.editButtonText}>{label}</Text>
		</Pressable>
	);
}

function MealRow({ scan, onPress }: { scan: ScanHistorySummary; onPress: () => void }) {
	const tone = riskLevelColors(scan.overallRiskLevel);
	const title = scan.dishName?.trim() || "Meal scan";

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}, ${scan.overallRiskLevel} risk`}
			onPress={onPress}
			style={({ pressed }) => [styles.mealRow, pressed && { opacity: 0.9 }]}
		>
			<SkeletonImage
				uri={scan.imageUri}
				style={styles.mealThumb}
				resizeMode="cover"
				skeletonRadius={radii.md}
				accessibilityLabel={`${title} photo`}
				fallback={
					<View style={styles.mealThumbFallback}>
						<Ionicons
							name="restaurant-outline"
							size={18}
							color={tokens.color.icon.muted}
						/>
					</View>
				}
			/>
			<View style={styles.mealCopy}>
				<Text style={styles.mealTitle} numberOfLines={1}>
					{title}
				</Text>
			</View>
			<View style={[styles.riskPill, { backgroundColor: tone.background }]}>
				<Text style={[styles.riskPillText, { color: tone.foreground }]}>
					{scan.overallRiskLevel} risk
				</Text>
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

const THUMB_SIZE = 44;

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
	heroVerdictRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	heroVerdict: {
		...tokens.type.display.section,
		flexShrink: 1,
		textAlign: "center",
	},
	heroStory: {
		...tokens.type.body.default,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
		textAlign: "center",
	},
	heroProfileNote: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.tertiary,
		textAlign: "center",
		marginTop: spacing.xs,
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
		...tokens.type.title.block,
		color: tokens.color.text.primary,
	},
	sectionMeta: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.text.tertiary,
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
	mealThumb: {
		width: THUMB_SIZE,
		height: THUMB_SIZE,
		borderRadius: radii.md,
	},
	mealThumbFallback: {
		width: THUMB_SIZE,
		height: THUMB_SIZE,
		borderRadius: radii.md,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		alignItems: "center",
		justifyContent: "center",
	},
	mealCopy: {
		flex: 1,
		gap: 2,
	},
	mealTitle: {
		...tokens.type.body.strong,
		color: tokens.color.text.primary,
	},
	riskPill: {
		borderRadius: radii.pill,
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
	},
	riskPillText: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
	},
	editButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.action.quiet.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
	},
	editButtonText: {
		...tokens.type.body.small,
		fontFamily: type.body.bold,
		color: tokens.color.action.quiet.foreground,
	},
	symptomStack: {
		gap: spacing.sm,
	},
	symptomChipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	symptomChip: {
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.verdict.watching.background,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
	},
	symptomChipText: {
		...tokens.type.label.chip,
		color: tokens.color.status.verdict.watching.foreground,
	},
	notesText: {
		...tokens.type.body.small,
		color: tokens.color.text.secondary,
	},
	noReportStack: {
		gap: spacing.md,
	},
	emptyCopy: {
		...tokens.type.body.default,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
	},
});

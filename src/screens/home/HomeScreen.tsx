import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { AppScreen, SectionCard, SkeletonBlock, Wordmark } from "../../components/common/UI";
import { TriggersSummaryRow } from "../../components/home/TriggersSummaryRow";
import { WeeklyProgressCard } from "../../components/progress/WeeklyProgressCard";
import { isLiveBackendConfigured } from "../../config/env";
import { useHomeData } from "../../features/home/hooks";
import { computeEngagementStreak } from "../../features/home/streak";
import { shouldBlockHomeForInitialRemoteData } from "../../features/home/viewState";
import { useInsightsData } from "../../features/insights/hooks";
import { buildTriggerProfileViewState } from "../../features/insights/triggerProfile";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { queryClient } from "../../services/query/client";
import { queryKeys } from "../../services/query/keys";
import { useAppStore } from "../../store/useAppStore";
import { components, radii, shadows, spacing, tokens } from "../../theme";
import { DailyGutReport, ScanHistorySummary } from "../../types/domain";
import { localDaypartGreeting } from "../../utils/time";
import {
	buildWeeklyProgressDay,
	buildWeeklyProgressDays,
	yesterdayLocalDate,
} from "../../utils/weeklyProgress";
import { GutScoreHomeCard } from "./GutScoreHomeCard";
import { GutScoreInfoModal } from "./GutScoreInfoModal";

const DAILY_REPORT_PROMPT_DISMISSED_KEY = "home.dailyReportPromptDismissedDate";
const EMPTY_SCANS: ScanHistorySummary[] = [];
const EMPTY_DAILY_REPORTS: DailyGutReport[] = [];

export function HomeScreen() {
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackReports = useAppStore((state) => state.dailyReports);
	const fallbackProfile = useAppStore((state) => state.profile);
	const fallbackInsights = useAppStore((state) => state.insights);
	const authUser = useAppStore((state) => state.authUser);
	const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
	const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
	const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
	const learningSyncInFlight = useAppStore((state) => state.learningSyncInFlight);
	const [gutScoreInfoVisible, setGutScoreInfoVisible] = useState(false);
	const [clockNow, setClockNow] = useState(() => new Date());
	const [dismissedDailyReportPromptDate, setDismissedDailyReportPromptDate] = useState<
		string | null
	>(null);

	const greeting = localDaypartGreeting(clockNow);
	const homeQuery = useHomeData();
	const insightsQuery = useInsightsData("");
	const [refreshing, setRefreshing] = useState(false);
	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.home }),
				queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
			]);
		} finally {
			setRefreshing(false);
		}
	}, []);
	const hasRemoteQueryData = Boolean(homeQuery.data);
	const hasFallbackHomeData = Boolean(
		fallbackProfile || fallbackReports.length || fallbackScans.length,
	);
	const isWaitingForInitialRemoteData = shouldBlockHomeForInitialRemoteData({
		isLiveBackendConfigured,
		hasAuthUser: Boolean(authUser),
		hasRemoteQueryData,
		hasFallbackHomeData,
		remoteDataLoaded,
		initialServerSyncNeeded,
		serverSyncInFlight,
		queryLoading: homeQuery.isLoading,
		queryFetching: homeQuery.isFetching,
		queryError: homeQuery.isError,
	});
	const snapshotLearningInFlight =
		homeQuery.data?.learningStatus === "pending" ||
		homeQuery.data?.learningStatus === "running";
	const isWaitingForComputedData = isWaitingForInitialRemoteData;
	const canUseFallbackData = !isWaitingForInitialRemoteData;
	const scans = useMemo(
		() => (canUseFallbackData ? (homeQuery.data?.recentScans ?? fallbackScans) : EMPTY_SCANS),
		[canUseFallbackData, fallbackScans, homeQuery.data?.recentScans],
	);
	const dailyReports = useMemo(
		() =>
			canUseFallbackData
				? (homeQuery.data?.dailyReports ?? fallbackReports)
				: EMPTY_DAILY_REPORTS,
		[canUseFallbackData, fallbackReports, homeQuery.data?.dailyReports],
	);
	const profile = canUseFallbackData
		? (homeQuery.data?.profile ?? fallbackProfile)
		: homeQuery.data?.profile;
	const insights = useMemo(
		() => (canUseFallbackData ? (insightsQuery.data?.insights ?? fallbackInsights) : []),
		[canUseFallbackData, fallbackInsights, insightsQuery.data?.insights],
	);
	const gutScoreProfile = profile;
	const yesterdayDate = yesterdayLocalDate(clockNow);
	const yesterdayReport = dailyReports.find((report) => report.localDate === yesterdayDate);
	const needsDailyReport = !yesterdayReport;
	const shouldShowDailyReportBanner =
		!isWaitingForComputedData &&
		!snapshotLearningInFlight &&
		!learningSyncInFlight &&
		needsDailyReport &&
		dismissedDailyReportPromptDate !== yesterdayDate;
	const displayName = profile?.displayName?.trim();
	const profileMeta = gutScoreProfile?.stomachProfile.metadata;
	const gutScore = profileMeta?.gutScore;

	const streakCount = useMemo(
		() => computeEngagementStreak({ scans, reports: dailyReports, now: clockNow }),
		[scans, dailyReports, clockNow],
	);
	const triggerCounts = useMemo(() => buildTriggerProfileViewState(insights).counts, [insights]);
	const weeklyProgressDays = useMemo(
		() =>
			buildWeeklyProgressDays({
				scans,
				reports: dailyReports,
				anchorDate: clockNow,
			}),
		[clockNow, dailyReports, scans],
	);
	const featuredDailyScoreDay = useMemo(
		() =>
			buildWeeklyProgressDay({
				scans,
				reports: dailyReports,
				localDate: yesterdayDate,
			}),
		[dailyReports, scans, yesterdayDate],
	);
	useEffect(() => {
		trackEvent("home_viewed");
		trackEvent("gut_score_viewed", {
			score: gutScore?.currentScore,
			phase: gutScore?.phase,
			trend_delta_7d: gutScore?.trendDelta7d,
		});
	}, [gutScore?.currentScore, gutScore?.phase, gutScore?.trendDelta7d]);

	useEffect(() => {
		const interval = setInterval(() => setClockNow(new Date()), 60 * 1000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		let active = true;

		AsyncStorage.getItem(DAILY_REPORT_PROMPT_DISMISSED_KEY)
			.then((value) => {
				if (active) {
					setDismissedDailyReportPromptDate(value);
				}
			})
			.catch(() => {
				if (active) {
					setDismissedDailyReportPromptDate(null);
				}
			});

		return () => {
			active = false;
		};
	}, []);

	function dismissDailyReportBanner() {
		setDismissedDailyReportPromptDate(yesterdayDate);
		void AsyncStorage.setItem(DAILY_REPORT_PROMPT_DISMISSED_KEY, yesterdayDate);
	}

	return (
		<AppScreen
			refreshControl={
				<RefreshControl
					refreshing={refreshing}
					onRefresh={() => void handleRefresh()}
					tintColor={tokens.color.text.secondary}
				/>
			}
		>
			<View style={styles.headerStack}>
				<View style={styles.topRow}>
					<View style={styles.wordmarkWrap} accessibilityLabel="MyTummyHurts">
						<Wordmark />
					</View>

					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Open settings"
						onPress={() => {
							navigation.navigate("Settings");
						}}
						style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.78 }]}
					>
						<Ionicons
							name="person-circle-outline"
							size={22}
							color={tokens.color.icon.primary}
						/>
					</Pressable>
				</View>

				<View style={styles.titleStack}>
					{isWaitingForInitialRemoteData ? (
						<>
							<SkeletonBlock width="72%" height={22} radius={radii.sm} />
							<SkeletonBlock width={112} height={18} radius={radii.sm} />
						</>
					) : (
						<Text style={styles.greetingText} numberOfLines={1} ellipsizeMode="tail">
							{displayName ? `${greeting}, ${displayName} 👋` : `${greeting} 👋`}
						</Text>
					)}
					{!isWaitingForInitialRemoteData && streakCount > 0 ? (
						<View style={styles.streakRow}>
							<Text style={styles.streakIcon}>🔥</Text>
							<Text style={styles.streakText}>{streakCount} day streak</Text>
						</View>
					) : null}
				</View>
			</View>

			{shouldShowDailyReportBanner ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="How did your gut feel yesterday? Add a symptom report to personalize your scores."
					onPress={() =>
						navigation.navigate("DailyGutReport", { localDate: yesterdayDate })
					}
					style={({ pressed }) => [
						styles.dailyReportBanner,
						pressed && { opacity: 0.92 },
					]}
				>
					<View style={styles.dailyReportBannerIcon}>
						<Ionicons name="pulse-outline" size={18} color={tokens.color.accent.brand} />
					</View>
					<View style={styles.dailyReportBannerCopy}>
						<Text style={styles.dailyReportBannerTitle}>
							How did your gut feel yesterday?
						</Text>
						<Text style={styles.dailyReportBannerSubtitle}>
							Add a symptom report to personalize your scores.
						</Text>
					</View>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Dismiss symptom report reminder"
						hitSlop={10}
						onPress={(event) => {
							event.stopPropagation();
							dismissDailyReportBanner();
						}}
						style={({ pressed }) => [
							styles.dailyReportBannerClose,
							pressed && { opacity: 0.72 },
						]}
					>
						<Ionicons name="close" size={18} color={tokens.color.icon.muted} />
					</Pressable>
				</Pressable>
			) : null}

			{isWaitingForComputedData || !gutScore ? (
				<GutScoreHomeCardSkeleton />
			) : (
				<GutScoreHomeCard
					score={gutScore.currentScore}
					trendDelta7d={gutScore.trendDelta7d}
					onInfoPress={() => setGutScoreInfoVisible(true)}
				/>
			)}

			{!isWaitingForComputedData ? (
				<TriggersSummaryRow
					counts={triggerCounts}
					onPress={() => {
						trackEvent("trigger_summary_opened", { entry_point: "home_row" });
						navigation.navigate("MainTabs", { screen: "Insights" });
					}}
				/>
			) : null}

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Scan food"
				onPress={() => {
					trackEvent("scan_camera_opened", { entry_point: "home_scan_cta" });
					navigation.navigate("ScanCapture", {
						sourceType: "camera",
						manualMode: false,
						scanCategory: "food",
						initialMode: "food",
					});
				}}
				style={({ pressed }) => [styles.scanCtaPill, pressed && { opacity: 0.92 }]}
			>
				<View style={styles.scanIconBubble}>
					<Ionicons
						name="camera-outline"
						size={18}
						color={components.scanCta.arrowForeground}
					/>
				</View>
				<Text style={styles.scanTitle}>Scan food</Text>
				<View style={styles.scanArrow}>
					<Ionicons
						name="arrow-forward"
						size={16}
						color={components.scanCta.arrowForeground}
					/>
				</View>
			</Pressable>

			{isWaitingForComputedData ? (
				<WeeklyProgressCardSkeleton />
			) : (
				<WeeklyProgressCard
					days={weeklyProgressDays}
					featuredDay={featuredDailyScoreDay}
					onFeaturedMealsPress={(day) =>
						navigation.navigate("DailyScoreDay", { localDate: day.localDate })
					}
					onFeaturedSymptomsPress={(day) =>
						navigation.navigate("DailyScoreDay", { localDate: day.localDate })
					}
					onPress={() => {
						trackEvent("weekly_progress_opened", { entry_point: "home_card" });
						navigation.navigate("WeeklyProgress");
					}}
				/>
			)}

			<GutScoreInfoModal
				visible={gutScoreInfoVisible}
				onClose={() => setGutScoreInfoVisible(false)}
			/>
		</AppScreen>
	);
}

function GutScoreHomeCardSkeleton() {
	return (
		<SectionCard style={styles.gutScoreSkeletonCard}>
			<View style={styles.skeletonCopyColumn}>
				<View style={styles.skeletonHeaderRow}>
					<SkeletonBlock width={84} height={22} radius={radii.sm} />
					<SkeletonBlock width={26} height={26} radius={13} />
				</View>
				<View style={styles.skeletonScoreRow}>
					<SkeletonBlock width={68} height={44} radius={radii.md} />
					<SkeletonBlock
						width={44}
						height={22}
						radius={radii.sm}
						style={styles.skeletonScoreScale}
					/>
				</View>
				<SkeletonBlock width={138} height={36} radius={radii.sm} />
				<View style={styles.skeletonTrendRow}>
					<SkeletonBlock width={14} height={14} radius={7} />
					<SkeletonBlock width={108} height={14} radius={radii.sm} />
				</View>
			</View>
			<View style={styles.skeletonVisualWrap}>
				<SkeletonBlock width={124} height={96} radius={radii.xxl} />
				<SkeletonBlock width={78} height={28} radius={radii.pill} />
			</View>
		</SectionCard>
	);
}

function WeeklyProgressCardSkeleton() {
	return (
		<SectionCard style={styles.weeklyProgressSkeletonCard}>
			<View style={styles.weeklyProgressSkeletonHeader}>
				<View style={styles.skeletonCopyColumn}>
					<SkeletonBlock width={118} height={20} radius={radii.sm} />
				</View>
				<SkeletonBlock width={16} height={16} radius={8} />
			</View>
			<View style={styles.weeklyProgressSkeletonFeature}>
				<SkeletonBlock width={92} height={92} radius={46} />
				<View style={styles.weeklyProgressSkeletonFeatureCopy}>
					<SkeletonBlock width={108} height={14} radius={radii.sm} />
					<SkeletonBlock width="90%" height={16} radius={radii.sm} />
					<SkeletonBlock width="82%" height={16} radius={radii.sm} />
				</View>
			</View>
			<View style={styles.weeklyProgressSkeletonDays}>
				{[0, 1, 2, 3, 4, 5, 6].map((item) => (
					<View key={item} style={styles.weeklyProgressSkeletonDay}>
						<SkeletonBlock width={12} height={12} radius={radii.sm} />
						<SkeletonBlock width={24} height={24} radius={12} />
						<SkeletonBlock width={14} height={14} radius={7} />
						<SkeletonBlock width={20} height={12} radius={radii.sm} />
					</View>
				))}
			</View>
			<SkeletonBlock width="78%" height={12} radius={radii.sm} />
		</SectionCard>
	);
}

const styles = StyleSheet.create({
	headerStack: {
		gap: spacing.md,
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	wordmarkWrap: {
		flexShrink: 1,
	},
	titleStack: {
		gap: spacing.xs,
	},
	greetingText: {
		...tokens.type.title.block,
		color: tokens.color.text.primary,
	},
	streakRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	streakIcon: {
		fontSize: 15,
	},
	streakText: {
		...tokens.type.body.emphasis,
		color: tokens.color.text.secondary,
	},
	iconButton: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		alignItems: "center",
		justifyContent: "center",
	},
	dailyReportBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		backgroundColor: tokens.color.surface.card.default,
		borderRadius: radii.xl,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		...shadows.card,
	},
	dailyReportBannerIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	dailyReportBannerCopy: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	dailyReportBannerTitle: {
		...tokens.type.body.strong,
		color: tokens.color.text.primary,
	},
	dailyReportBannerSubtitle: {
		...tokens.type.body.small,
		color: tokens.color.text.secondary,
	},
	dailyReportBannerClose: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
	},
	gutScoreSkeletonCard: {
		minHeight: 168,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		paddingVertical: spacing.md,
	},
	skeletonCopyColumn: {
		flex: 1,
		minWidth: 0,
		gap: spacing.xs,
	},
	skeletonHeaderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginBottom: spacing.xs,
	},
	skeletonScoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.xs,
	},
	skeletonScoreScale: {
		marginBottom: 8,
	},
	skeletonTrendRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: spacing.xs,
	},
	skeletonVisualWrap: {
		width: 132,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	weeklyProgressSkeletonCard: {
		gap: spacing.sm,
		padding: spacing.sm,
	},
	weeklyProgressSkeletonHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	weeklyProgressSkeletonFeature: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	weeklyProgressSkeletonFeatureCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	weeklyProgressSkeletonDays: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	weeklyProgressSkeletonDay: {
		flex: 1,
		minHeight: 108,
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.xs,
		borderRadius: radii.md,
		backgroundColor: tokens.color.surface.app.default,
	},
	// The screen's saturated pill action: mint, deliberately a different
	// shape (pill) from the warm hero block above it.
	scanCtaPill: {
		...components.button.primary,
		backgroundColor: tokens.color.accent.brand,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	scanIconBubble: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: components.scanCta.arrowBackground,
		alignItems: "center",
		justifyContent: "center",
	},
	scanTitle: {
		...tokens.type.label.button,
		flex: 1,
		color: components.scanCta.title,
		textAlign: "center",
	},
	scanArrow: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: components.scanCta.arrowBackground,
		alignItems: "center",
		justifyContent: "center",
	},
});

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen, SectionCard, SkeletonBlock } from "../../components/common/UI";
import { WeeklyProgressCard } from "../../components/progress/WeeklyProgressCard";
import { isLiveBackendConfigured } from "../../config/env";
import { useHistoryFeed } from "../../features/history/hooks";
import { useInsightsData } from "../../features/insights/hooks";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { components, palette, radii, shadows, spacing, tokens, type } from "../../theme";
import { DailyGutReport, ScanRecord } from "../../types/domain";
import { localDaypartGreeting } from "../../utils/time";
import {
	buildWeeklyProgressDay,
	buildWeeklyProgressDays,
	yesterdayLocalDate,
} from "../../utils/weeklyProgress";
import { GutScoreHomeCard } from "./GutScoreHomeCard";
import { GutScoreInfoModal } from "./GutScoreInfoModal";

const MTH_TEXT_LOGO = require("../../../assets/mth_text_logo.png");
const DAILY_REPORT_PROMPT_DISMISSED_KEY = "home.dailyReportPromptDismissedDate";
const EMPTY_SCANS: ScanRecord[] = [];
const EMPTY_DAILY_REPORTS: DailyGutReport[] = [];

export function HomeScreen() {
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackReports = useAppStore((state) => state.dailyReports);
	const fallbackProfile = useAppStore((state) => state.profile);
	const authUser = useAppStore((state) => state.authUser);
	const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
	const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
	const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
	const [gutScoreInfoVisible, setGutScoreInfoVisible] = useState(false);
	const [clockNow, setClockNow] = useState(() => new Date());
	const [dismissedDailyReportPromptDate, setDismissedDailyReportPromptDate] =
		useState<string | null>(null);

	const greeting = localDaypartGreeting(clockNow);
	const historyQuery = useHistoryFeed(12);
	const insightsQuery = useInsightsData("");
	const hasRemoteQueryData = Boolean(historyQuery.data && insightsQuery.data);
	const isWaitingForInitialRemoteData = Boolean(
		isLiveBackendConfigured &&
			authUser &&
			!hasRemoteQueryData &&
			(!remoteDataLoaded || initialServerSyncNeeded || serverSyncInFlight) &&
			!historyQuery.isError &&
			!insightsQuery.isError,
	);
	const canUseFallbackData = !isWaitingForInitialRemoteData;
	const firstPage = historyQuery.data?.pages[0];
	const scans = useMemo(
		() => (canUseFallbackData ? firstPage?.scans ?? fallbackScans : EMPTY_SCANS),
		[canUseFallbackData, fallbackScans, firstPage?.scans],
	);
	const dailyReports = useMemo(
		() =>
			canUseFallbackData
				? firstPage?.dailyReports ?? fallbackReports
				: EMPTY_DAILY_REPORTS,
		[canUseFallbackData, fallbackReports, firstPage?.dailyReports],
	);
	const profile = canUseFallbackData
		? insightsQuery.data?.profile ?? fallbackProfile
		: insightsQuery.data?.profile;
	const yesterdayDate = yesterdayLocalDate(clockNow);
	const yesterdayReport = dailyReports.find((report) => report.localDate === yesterdayDate);
	const needsDailyReport = !yesterdayReport;
	const shouldShowDailyReportBanner =
		!isWaitingForInitialRemoteData &&
		needsDailyReport &&
		dismissedDailyReportPromptDate !== yesterdayDate;
	const displayName = profile?.displayName?.trim();
	const profileMeta = profile?.stomachProfile.metadata;
	const gutScore = profileMeta?.gutScore;

	const streakCount = useMemo(() => computeFoodLogStreak(scans), [scans]);
	const weeklyProgressDays = useMemo(
		() =>
			buildWeeklyProgressDays({
				scans,
				reports: dailyReports,
				anchorDate: clockNow,
			}),
		[clockNow, dailyReports, scans]
	);
	const featuredDailyScoreDay = useMemo(
		() =>
			buildWeeklyProgressDay({
				scans,
				reports: dailyReports,
				localDate: yesterdayDate,
			}),
		[dailyReports, scans, yesterdayDate]
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
		<AppScreen>
			<View style={styles.headerStack}>
				<View style={styles.topRow}>
					<Image
						source={MTH_TEXT_LOGO}
						style={styles.textLogo}
						resizeMode="contain"
						accessibilityLabel="MyTummyHurts"
					/>

					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Open settings"
						onPress={() => {
							navigation.navigate("Settings");
						}}
						style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.78 }]}
					>
						<Ionicons
							name="settings-outline"
							size={20}
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
					onPress={() =>
						navigation.navigate("DailyGutReport", { localDate: yesterdayDate })
					}
					style={({ pressed }) => [
						styles.dailyReportBanner,
						pressed && { opacity: 0.92 },
					]}
				>
					<View style={styles.dailyReportBannerIcon}>
						<Ionicons name="pulse-outline" size={18} color={palette.primary} />
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
						<Ionicons name="close" size={18} color={palette.textMuted} />
					</Pressable>
				</Pressable>
			) : null}

			{isWaitingForInitialRemoteData || !gutScore ? (
				<GutScoreHomeCardSkeleton />
			) : (
				<GutScoreHomeCard
					score={gutScore.currentScore}
					trendDelta7d={gutScore.trendDelta7d}
					onInfoPress={() => setGutScoreInfoVisible(true)}
				/>
			)}

			{isWaitingForInitialRemoteData ? (
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

			<Pressable
				onPress={() =>
					navigation.navigate("ScanCapture", { sourceType: "camera", manualMode: false })
				}
				style={({ pressed }) => [styles.scanCtaShell, pressed && { opacity: 0.92 }]}
			>
				<LinearGradient
					colors={[...components.scanCta.gradient]}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={styles.scanCtaGradient}
				>
					<View style={styles.scanAccentLeft} />
					<View style={styles.scanAccentRight} />
					<Ionicons name="camera-outline" size={42} color={components.scanCta.title} />
					<Text style={styles.scanTitle}>Scan a meal</Text>
					<Text style={styles.scanSubtitle}>Get instant insights</Text>
					<View style={styles.scanArrow}>
						<Ionicons
							name="arrow-forward"
							size={18}
							color={components.scanCta.arrowForeground}
						/>
					</View>
				</LinearGradient>
			</Pressable>

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
					<SkeletonBlock width={136} height={24} radius={radii.sm} />
				</View>
				<SkeletonBlock width={18} height={18} radius={9} />
			</View>
			<View style={styles.weeklyProgressSkeletonFeature}>
				<SkeletonBlock width={116} height={116} radius={58} />
				<View style={styles.weeklyProgressSkeletonFeatureCopy}>
					<SkeletonBlock width={118} height={14} radius={radii.sm} />
					<SkeletonBlock width="90%" height={18} radius={radii.sm} />
					<SkeletonBlock width="82%" height={18} radius={radii.sm} />
				</View>
			</View>
			<View style={styles.weeklyProgressSkeletonDays}>
				{[0, 1, 2, 3, 4, 5, 6].map((item) => (
					<View key={item} style={styles.weeklyProgressSkeletonDay}>
						<SkeletonBlock width={14} height={14} radius={radii.sm} />
						<SkeletonBlock width={30} height={30} radius={15} />
						<SkeletonBlock width={18} height={18} radius={9} />
						<SkeletonBlock width={22} height={14} radius={radii.sm} />
					</View>
				))}
			</View>
			<SkeletonBlock width="88%" height={16} radius={radii.sm} />
		</SectionCard>
	);
}

function computeFoodLogStreak(scans: ScanRecord[]) {
	const days = Array.from(
		new Set(
			scans
				.filter((scan) => (scan.scanCategory ?? "food") === "food")
				.map((scan) =>
					new Date(scan.createdAt).toLocaleDateString("en-US", {
						year: "numeric",
						month: "2-digit",
						day: "2-digit",
					})
				)
		)
	)
		.map((value) => new Date(value))
		.sort((left, right) => right.getTime() - left.getTime());

	let streak = 0;
	let cursor = new Date();
	cursor.setHours(0, 0, 0, 0);

	for (const day of days) {
		day.setHours(0, 0, 0, 0);
		if (day.getTime() === cursor.getTime()) {
			streak += 1;
			cursor.setDate(cursor.getDate() - 1);
			continue;
		}

		if (streak === 0) {
			const yesterday = new Date(cursor);
			yesterday.setDate(yesterday.getDate() - 1);
			if (day.getTime() === yesterday.getTime()) {
				streak += 1;
				cursor = yesterday;
			}
		}
	}

	return streak;
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
	textLogo: {
		width: 164,
		height: 34,
		flexShrink: 1,
	},
	titleStack: {
		gap: spacing.xs,
	},
	greetingText: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 17,
		lineHeight: 22,
		letterSpacing: -0.2,
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
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 15,
	},
	iconButton: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: tokens.color.surface.frosted,
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
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
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
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 16,
		letterSpacing: -0.2,
	},
	dailyReportBannerSubtitle: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
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
		gap: spacing.md,
		padding: spacing.md,
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
		gap: spacing.lg,
		paddingVertical: spacing.xs,
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
		minHeight: 142,
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
	},
	scanCtaShell: {
		borderRadius: radii.xxl,
		overflow: "hidden",
		...shadows.lift,
	},
	scanCtaGradient: {
		minHeight: 212,
		borderRadius: radii.xxl,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xl,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		position: "relative",
	},
	scanAccentLeft: {
		position: "absolute",
		width: 84,
		height: 84,
		borderRadius: 42,
		backgroundColor: components.scanCta.ornamentLeft,
		left: -16,
		bottom: -10,
	},
	scanAccentRight: {
		position: "absolute",
		width: 118,
		height: 118,
		borderRadius: 59,
		backgroundColor: components.scanCta.ornamentRight,
		right: -28,
		top: -20,
	},
	scanTitle: {
		color: components.scanCta.title,
		fontFamily: type.body.bold,
		fontSize: 38,
		letterSpacing: -1,
	},
	scanSubtitle: {
		color: components.scanCta.subtitle,
		fontFamily: type.body.medium,
		fontSize: 18,
	},
	scanArrow: {
		position: "absolute",
		right: spacing.lg,
		bottom: spacing.lg,
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: components.scanCta.arrowBackground,
		alignItems: "center",
		justifyContent: "center",
	},
});

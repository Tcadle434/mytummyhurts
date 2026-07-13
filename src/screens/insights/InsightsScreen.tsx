import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { NavigationProp, useNavigation } from "@react-navigation/native";

import {
	AppScreen,
	EmptyState,
	SectionCard,
	SkeletonBlock,
	TabScreenHeader,
	verdictTone,
} from "../../components/common/UI";
import { isLiveBackendConfigured } from "../../config/env";
import { useInsightsData } from "../../features/insights/hooks";
import { resolveTriggerProfileLearningProgress } from "../../features/insights/learningProgress";
import {
	CONDITION_LENS_LABEL,
	conditionLensFromKnownConditions,
} from "../../features/insights/triggerGroups";
import {
	buildTriggerProfileViewState,
} from "../../features/insights/triggerProfile";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	CELEBRATED_CLEARED_STORAGE_KEY,
	nextClearedCelebration,
	parseCelebratedKeys,
	serializeCelebratedKeys,
	type ClearedCelebrationCandidate,
} from "./clearedCelebration";
import { CaseboardHero, CaseboardHeroSkeleton } from "./CaseboardHero";
import { ClearedCelebrationModal } from "./ClearedCelebrationModal";
import { ConditionsChipRow } from "./ConditionsChipRow";
import { LearningStageCue, LearningStageInfoModal } from "./LearningStage";
import { ClearedBand, SafeChipGarden } from "./SafetyTrack";
import { TrackedFamilies } from "./TrackedFamilies";
import { TriggerProfileRow } from "./TriggerProfileRow";

const ROW_STAGGER_MS = 45;

export function InsightsScreen() {
	const navigation = useNavigation<NavigationProp<RootStackParamList>>();
	const fallbackProfile = useAppStore((state) => state.profile);
	const fallbackInsights = useAppStore((state) => state.insights);
	const fallbackScans = useAppStore((state) => state.scans);
	const fallbackDailyReports = useAppStore((state) => state.dailyReports);
	const authUser = useAppStore((state) => state.authUser);
	const remoteDataLoaded = useAppStore((state) => state.remoteDataLoaded);
	const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
	const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
	const insightsQuery = useInsightsData("");
	const hasFallbackInsights = Boolean(fallbackProfile || fallbackInsights.length);
	const [familiesExpanded, setFamiliesExpanded] = useState(true);
	const [learningInfoVisible, setLearningInfoVisible] = useState(false);
	const [celebratedKeys, setCelebratedKeys] = useState<Set<string> | null>(null);
	const [celebration, setCelebration] = useState<ClearedCelebrationCandidate | null>(null);
	const celebrationShownThisVisit = useRef(false);

	const isWaitingForInitialRemoteData = Boolean(
		isLiveBackendConfigured &&
		authUser &&
		!insightsQuery.data &&
		!hasFallbackInsights &&
		(!remoteDataLoaded ||
			initialServerSyncNeeded ||
			serverSyncInFlight ||
			insightsQuery.isLoading ||
			(!insightsQuery.data && insightsQuery.isFetching)) &&
		!insightsQuery.isError,
	);
	const isWaitingForComputedData = isWaitingForInitialRemoteData;
	const profile = isWaitingForComputedData
		? insightsQuery.data?.profile
		: (insightsQuery.data?.profile ?? fallbackProfile);
	const insights = useMemo(
		() => (isWaitingForComputedData ? [] : (insightsQuery.data?.insights ?? fallbackInsights)),
		[fallbackInsights, insightsQuery.data?.insights, isWaitingForComputedData],
	);

	const conditions = useMemo(() => profile?.knownConditions ?? [], [profile?.knownConditions]);
	const viewState = useMemo(
		() => buildTriggerProfileViewState(insights, {}, { knownConditions: conditions }),
		[conditions, insights],
	);
	const conditionLens = useMemo(() => conditionLensFromKnownConditions(conditions), [conditions]);
	const learningProgress = useMemo(
		() =>
			resolveTriggerProfileLearningProgress({
				liveBackendConfigured: isLiveBackendConfigured,
				profile,
				fallbackScans,
				fallbackDailyReports,
			}),
		[fallbackDailyReports, fallbackScans, profile],
	);

	useEffect(() => {
		trackEvent("trigger_profile_viewed", {
			confirmed: viewState.counts.confirmed,
			suspects: viewState.counts.suspects,
			watching: viewState.counts.watching,
			cleared: viewState.counts.cleared,
			safe: viewState.counts.safe,
		});
		// Counts settle after the first data load; one view event per visit is enough.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function openGroup(groupKey: string, label: string) {
		trackEvent("trigger_group_detail_viewed", { group_key: groupKey, label });
		navigation.navigate("InsightDetail", { groupKey });
	}

	function openFamily(familyKey: string, label: string) {
		trackEvent("tracked_food_family_detail_viewed", { family_key: familyKey, label });
		navigation.navigate("InsightDetail", { familyKey });
	}

	function openEntry(entry: { kind: "group" | "family"; key: string; label: string }) {
		if (entry.kind === "group") {
			openGroup(entry.key, entry.label);
		} else {
			openFamily(entry.key, entry.label);
		}
	}

	function openDailyCheckIn() {
		trackEvent("trigger_profile_checkin_cta_tapped", {});
		navigation.navigate("DailyGutReport", {});
	}

	useEffect(() => {
		let active = true;
		AsyncStorage.getItem(CELEBRATED_CLEARED_STORAGE_KEY)
			.then((raw) => {
				if (active) setCelebratedKeys(parseCelebratedKeys(raw));
			})
			.catch(() => {
				if (active) setCelebratedKeys(new Set());
			});
		return () => {
			active = false;
		};
	}, []);

	// The cleared celebration: the first time a food earns its verdict, it gets
	// a moment — once per food, at most one per visit.
	useEffect(() => {
		if (isWaitingForComputedData || !celebratedKeys || celebrationShownThisVisit.current) {
			return;
		}
		const clearedEntries =
			viewState.sections.find((section) => section.status === "cleared")?.entries ?? [];
		const candidate = nextClearedCelebration(clearedEntries, celebratedKeys);
		if (candidate) {
			celebrationShownThisVisit.current = true;
			setCelebration(candidate);
			trackEvent("cleared_celebration_shown", { label: candidate.label });
		}
	}, [celebratedKeys, isWaitingForComputedData, viewState]);

	function closeCelebration() {
		if (!celebration) return;
		const nextKeys = new Set(celebratedKeys ?? []);
		nextKeys.add(celebration.key);
		setCelebratedKeys(nextKeys);
		setCelebration(null);
		void AsyncStorage.setItem(CELEBRATED_CLEARED_STORAGE_KEY, serializeCelebratedKeys(nextKeys));
	}

	const isEmptyBoard =
		!isWaitingForComputedData &&
		viewState.sections.length === 0 &&
		viewState.trackedFamilies.length === 0;

	let rowIndex = 0;

	return (
		<>
			<AppScreen>
				<TabScreenHeader title="Your Trigger Profile" />

				{isWaitingForComputedData ? (
					<>
						<CaseboardHeroSkeleton />
						<ListSkeleton rows={4} />
					</>
				) : isEmptyBoard ? (
					<>
						<EmptyState
							title="Your Trigger Profile starts here"
							subtitle="Scan meals and file daily check-ins — suspects, confirmed triggers, and safe foods build up on this screen."
							actionLabel="File today's check-in"
							onAction={openDailyCheckIn}
						/>
						<LearningStageCue
							learningProgress={learningProgress}
							onOpen={() => setLearningInfoVisible(true)}
						/>
						<ConditionsChipRow
							conditions={conditions}
							onEdit={() => navigation.navigate("Settings", { section: "conditions" })}
						/>
					</>
				) : (
					<>
						<CaseboardHero viewState={viewState} />

						{conditionLens.length > 0 ? (
							<View style={styles.lensRow}>
								<Ionicons name="eye-outline" size={13} color={tokens.color.text.tertiary} />
								<Text style={styles.lensText}>
									Tuned to your{" "}
									{conditionLens.map((key) => CONDITION_LENS_LABEL[key]).join(" + ")} — those
									patterns surface first
								</Text>
							</View>
						) : null}

						<Pressable
							accessibilityRole="button"
							accessibilityLabel="File today's check-in"
							onPress={openDailyCheckIn}
							style={({ pressed }) => [styles.checkInCta, pressed && { opacity: 0.9 }]}
						>
							<Ionicons name="pulse-outline" size={20} color={tokens.color.action.primary.foreground} />
							<View style={styles.checkInCtaCopy}>
								<Text style={styles.checkInCtaTitle}>{"File today's check-in"}</Text>
								<Text style={styles.checkInCtaSubtitle}>It moves every open case</Text>
							</View>
							<Ionicons name="arrow-forward" size={18} color={tokens.color.action.primary.foreground} />
						</Pressable>

						<LearningStageCue
							learningProgress={learningProgress}
							onOpen={() => setLearningInfoVisible(true)}
						/>

						{viewState.allSeeded ? (
							<SectionCard variant="warm" style={styles.seedBanner}>
								<View style={styles.seedBannerIcon}>
									<Ionicons name="document-text-outline" size={18} color={tokens.color.text.warm} />
								</View>
								<Text style={styles.seedBannerText}>
									These suspects come straight from your answers. Daily check-ins confirm
									or clear each one with real evidence.
								</Text>
							</SectionCard>
						) : null}

						{viewState.sections.map((section) => {
							// Silhouette alternation: risk verdicts read as open case
							// files (detailed rows); cleared is one settled tinted band;
							// looking-safe is a light chip garden. Same data, three
							// shapes — the screen stops being a wall of identical rows.
							if (section.status === "cleared") {
								return (
									<ClearedBand
										key={section.status}
										entries={section.entries}
										onOpen={openEntry}
									/>
								);
							}
							if (section.status === "safe") {
								return (
									<SafeChipGarden
										key={section.status}
										entries={section.entries}
										onOpen={openEntry}
									/>
								);
							}
							return (
								<View key={section.status} style={styles.section}>
									<View style={styles.sectionHeader}>
										<View style={styles.sectionTitleRow}>
											<Text style={[styles.sectionTitle, { color: verdictTone(section.status).foreground }]}>
												{section.title}
											</Text>
											<View style={styles.sectionTitleSpacer} />
											<Text style={styles.sectionCountText}>
												{section.entries.length}
											</Text>
										</View>
										<Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
									</View>
									<View style={styles.listStack}>
										{section.entries.map((entry) => {
											const delay = ROW_STAGGER_MS * Math.min(rowIndex, 10);
											rowIndex += 1;
											return (
												<Animated.View
													key={entry.insight.id}
													entering={FadeInUp.duration(300).delay(delay)}
												>
													<TriggerProfileRow
														insight={entry.insight}
														status={section.status}
														emoji={entry.emoji}
														extraDetail={entry.memberSummary}
														onPress={() => openEntry(entry)}
													/>
												</Animated.View>
											);
										})}
									</View>
								</View>
							);
						})}

						<TrackedFamilies
							entries={viewState.trackedFamilies}
							expanded={familiesExpanded}
							onToggle={() => setFamiliesExpanded((current) => !current)}
							onOpen={openFamily}
						/>

						<ConditionsChipRow
							conditions={conditions}
							onEdit={() => navigation.navigate("Settings", { section: "conditions" })}
						/>
					</>
				)}
			</AppScreen>
			<LearningStageInfoModal
				visible={learningInfoVisible}
				onClose={() => setLearningInfoVisible(false)}
				learningProgress={learningProgress}
			/>
			<ClearedCelebrationModal
				candidate={celebration}
				onClose={closeCelebration}
				onShare={() =>
					trackEvent("cleared_celebration_shared", { label: celebration?.label ?? "" })
				}
			/>
		</>
	);
}

function ListSkeleton({ rows }: { rows: number }) {
	return (
		<View style={styles.listStack}>
			{Array.from({ length: rows }).map((_, index) => (
				<View key={index} style={styles.skeletonRow}>
					<SkeletonBlock width={40} height={40} radius={20} />
					<View style={styles.skeletonCopy}>
						<SkeletonBlock width="62%" height={14} radius={radii.sm} />
						<SkeletonBlock width="42%" height={12} radius={radii.sm} />
					</View>
					<SkeletonBlock width={64} height={22} radius={radii.pill} />
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	// The CTA sits right under the warm hero, so it takes the mint
	// accent.brand pill — an action, never a second hero block.
	checkInCta: {
		...components.button.primary,
		backgroundColor: tokens.color.accent.brand,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingVertical: spacing.sm,
	},
	checkInCtaCopy: {
		flex: 1,
		gap: 1,
	},
	checkInCtaTitle: {
		...tokens.type.label.button,
		color: tokens.color.action.primary.foreground,
	},
	checkInCtaSubtitle: {
		...tokens.type.label.tab,
		color: tokens.color.action.primary.foreground,
		opacity: 0.85,
	},
	seedBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	seedBannerIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.utility.white,
	},
	seedBannerText: {
		...tokens.type.body.small,
		flex: 1,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
	},
	section: {
		gap: spacing.sm,
	},
	sectionHeader: {
		gap: 2,
		paddingHorizontal: spacing.xs,
	},
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: spacing.xs,
	},
	sectionTitle: {
		...tokens.type.display.accent,
	},
	sectionTitleSpacer: {
		flex: 1,
	},
	sectionCountText: {
		...tokens.type.body.small,
		fontFamily: type.body.bold,
		color: tokens.color.text.tertiary,
	},
	sectionSubtitle: {
		...tokens.type.label.metric,
		color: tokens.color.text.tertiary,
	},
	listStack: {
		gap: spacing.xs,
	},
	skeletonRow: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	skeletonCopy: {
		flex: 1,
		gap: 4,
	},
	lensRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		marginTop: -spacing.xs,
	},
	lensText: {
		...tokens.type.body.small,
		flex: 1,
		color: tokens.color.text.tertiary,
	},
});

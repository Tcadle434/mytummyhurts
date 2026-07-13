import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useMemo, useRef, useState } from "react";
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
import { InfoModal } from "../../components/modals/InfoModal";
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
import {
	type ProfileLearningProgress,
} from "../../services/ai/scoring";
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
import { ClearedBand, SafeChipGarden } from "./SafetyTrack";
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

						{viewState.trackedFamilies.length > 0 ? (
							<View style={styles.familyBlock}>
								<Pressable
									accessibilityRole="button"
									accessibilityState={{ expanded: familiesExpanded }}
									onPress={() => setFamiliesExpanded((current) => !current)}
									style={({ pressed }) => [
										styles.familyToggle,
										pressed && { opacity: 0.85 },
									]}
								>
									<Ionicons
										name={familiesExpanded ? "chevron-down" : "chevron-forward"}
										size={15}
										color={tokens.color.text.secondary}
									/>
									<Text style={styles.familyToggleText}>
										Still watching
									</Text>
									<Text style={styles.familyToggleCount}>{viewState.trackedFamilies.length}</Text>
								</Pressable>
								<Text style={styles.familyIntro}>
									Foods from your scans that need paired check-ins before a verdict.
								</Text>
								{familiesExpanded ? (
									<View style={styles.familyList}>
										{viewState.trackedFamilies.map((entry) => (
											<Pressable
												key={entry.family.key}
												accessibilityRole="button"
												accessibilityLabel={`${entry.family.label}, ${familyMeta(entry.members.length, entry.evidenceCount)}`}
												onPress={() => openFamily(entry.family.key, entry.family.label)}
												style={({ pressed }) => [
													styles.familyRow,
													pressed && { opacity: 0.88 },
												]}
											>
												<View style={styles.familyGlyph}>
													<Text style={styles.familyGlyphEmoji}>{entry.family.emoji}</Text>
												</View>
												<View style={styles.familyCopy}>
													<Text style={styles.familyRowName} numberOfLines={1}>
														{entry.family.label}
													</Text>
													<Text style={styles.familyRowMeta} numberOfLines={2}>
														{familyMeta(entry.members.length, entry.evidenceCount)}
														{entry.memberSummary ? ` · ${entry.memberSummary}` : ""}
													</Text>
												</View>
												<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
											</Pressable>
										))}
									</View>
								) : null}
							</View>
						) : null}

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

function familyMeta(foodCount: number, evidenceCount: number) {
	const foods = `${foodCount} food${foodCount === 1 ? "" : "s"}`;
	if (evidenceCount <= 0) return foods;
	return `${foods} tracked across ${evidenceCount} paired day${evidenceCount === 1 ? "" : "s"}`;
}

// The learning-stage card, demoted from hero to supporting cue: same content
// (stage, percent, paired counts), quieter surface, one tap for the full story.
function LearningStageCue({
	learningProgress,
	onOpen,
}: {
	learningProgress: ProfileLearningProgress;
	onOpen: () => void;
}) {
	const stageLabel =
		learningProgress.stage === "confident"
			? "Confident"
			: learningProgress.stage === "growing"
				? "Growing"
				: "Early";

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="What is learning stage?"
			onPress={onOpen}
			style={({ pressed }) => [styles.learningCard, pressed && { opacity: 0.9 }]}
		>
			<View style={styles.learningHeader}>
				<Ionicons name="sparkles-outline" size={14} color={tokens.color.text.accent} />
				<Text style={styles.learningTitle}>Learning stage</Text>
				<View style={styles.learningStageBubble}>
					<Text style={styles.learningStageLabel}>{stageLabel}</Text>
				</View>
				<View style={styles.learningSpacer} />
				<Text style={styles.learningPercent}>{learningProgress.percent}%</Text>
				<Ionicons name="chevron-forward" size={14} color={tokens.color.icon.muted} />
			</View>
			<View style={styles.learningProgressTrack}>
				<View
					style={[
						styles.learningProgressFill,
						{ width: `${learningProgress.percent}%` },
					]}
				/>
			</View>
			<Text style={styles.learningMeta}>
				{learningProgress.pairedReportDays}/{learningProgress.confidentReportDays}{" "}
				symptom-report days · {learningProgress.pairedMealScans}/
				{learningProgress.confidentMealScans} meal scans paired
			</Text>
		</Pressable>
	);
}

function LearningStageInfoModal({
	visible,
	onClose,
	learningProgress,
}: {
	visible: boolean;
	onClose: () => void;
	learningProgress: ProfileLearningProgress;
}) {
	return (
		<InfoModal
			visible={visible}
			onClose={onClose}
			title="What is learning stage?"
			body="This is how we adapt to your gut. Meal scans combined with symptom reports."
			accessibilityLabel="Learning stage explanation"
			ctaLabel="Got it"
			pipState="thinking"
			pipSize={78}
		>
			<View style={styles.learningModalStats}>
				<LearningModalStat
					icon="calendar-outline"
					value={`${learningProgress.pairedReportDays}/${learningProgress.confidentReportDays}`}
					label="Symptom-report days"
				/>
				<LearningModalStat
					icon="restaurant-outline"
					value={`${learningProgress.pairedMealScans}/${learningProgress.confidentMealScans}`}
					label="Meal scans paired"
				/>
			</View>

			<View style={styles.learningModalSteps}>
				<LearningModalStep
					icon="scan-outline"
					title="Scan what you ate"
					body="Food scans give ingredient context."
				/>
				<LearningModalStep
					icon="pulse-outline"
					title="Log symptoms nearby"
					body="A symptom report gives the outcome."
				/>
				<LearningModalStep
					icon="trending-up-outline"
					title="Together, they count"
					body="A meal today plus symptoms today updates this progress right away."
				/>
			</View>
		</InfoModal>
	);
}

function LearningModalStat({
	icon,
	value,
	label,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	value: string;
	label: string;
}) {
	return (
		<View style={styles.learningModalStat}>
			<Ionicons name={icon} size={20} color={tokens.color.accent.brand} />
			<Text style={styles.learningModalStatValue}>{value}</Text>
			<Text style={styles.learningModalStatLabel}>{label}</Text>
		</View>
	);
}

function LearningModalStep({
	icon,
	title,
	body,
}: {
	icon: ComponentProps<typeof Ionicons>["name"];
	title: string;
	body: string;
}) {
	return (
		<View style={styles.learningModalStep}>
			<View style={styles.learningModalStepIcon}>
				<Ionicons name={icon} size={18} color={tokens.color.accent.brand} />
			</View>
			<View style={styles.learningModalStepCopy}>
				<Text style={styles.learningModalStepTitle}>{title}</Text>
				<Text style={styles.learningModalStepBody}>{body}</Text>
			</View>
		</View>
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
	learningCard: {
		gap: spacing.xs,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	learningHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	learningTitle: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.text.secondary,
	},
	learningStageBubble: {
		borderRadius: radii.pill,
		backgroundColor: tokens.color.action.quiet.background,
		paddingHorizontal: spacing.xs,
		paddingVertical: 2,
	},
	learningStageLabel: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
		color: tokens.color.action.quiet.foreground,
	},
	learningSpacer: {
		flex: 1,
	},
	learningPercent: {
		...tokens.type.metric.value,
		color: tokens.color.text.primary,
	},
	learningProgressTrack: {
		height: 6,
		overflow: "hidden",
		borderRadius: radii.pill,
		backgroundColor: tokens.color.chart.track,
	},
	learningProgressFill: {
		height: "100%",
		minWidth: 8,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.accent.brand,
	},
	learningMeta: {
		...tokens.type.label.metric,
		color: tokens.color.text.tertiary,
	},
	learningModalStats: {
		width: "100%",
		flexDirection: "row",
		gap: spacing.xs,
		marginTop: spacing.sm,
	},
	// Porcelain tiles inside the white modal sheet — quiet separation without
	// hairlines or translucency.
	learningModalStat: {
		flex: 1,
		minHeight: 94,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		borderRadius: radii.md,
		backgroundColor: tokens.color.surface.app.default,
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
	},
	learningModalStatValue: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 26,
		letterSpacing: 0,
	},
	learningModalStatLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
	},
	learningModalSteps: {
		width: "100%",
		gap: spacing.xs,
		marginTop: spacing.xs,
	},
	learningModalStep: {
		flexDirection: "row",
		gap: spacing.sm,
		alignItems: "flex-start",
		borderRadius: radii.md,
		backgroundColor: tokens.color.surface.app.default,
		padding: spacing.sm,
	},
	learningModalStepIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.status.success.background,
	},
	learningModalStepCopy: {
		flex: 1,
		gap: 2,
	},
	learningModalStepTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	learningModalStepBody: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
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
	familyBlock: {
		gap: spacing.xs,
	},
	familyToggle: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.sm,
	},
	familyToggleText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	familyToggleCount: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
	},
	familyIntro: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
		paddingHorizontal: spacing.sm,
		marginTop: -spacing.xs,
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
	familyList: {
		gap: spacing.xs,
	},
	familyRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	familyGlyph: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.status.verdict.watching.background,
	},
	familyGlyphEmoji: {
		fontSize: 18,
	},
	familyCopy: {
		flex: 1,
		gap: 3,
	},
	familyRowName: {
		flexShrink: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	familyRowMeta: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 11,
		lineHeight: 15,
	},
});

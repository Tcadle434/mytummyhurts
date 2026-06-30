import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

import { Pip } from "../../components/common/Pip";
import { AppScreen, SectionCard, SkeletonBlock, TabScreenHeader } from "../../components/common/UI";
import { InfoModal } from "../../components/modals/InfoModal";
import { isLiveBackendConfigured } from "../../config/env";
import { useInsightsData } from "../../features/insights/hooks";
import { resolveTriggerProfileLearningProgress } from "../../features/insights/learningProgress";
import { buildTriggerProfileViewState } from "../../features/insights/triggerProfile";
import { RootStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import {
	type ProfileLearningProgress,
} from "../../services/ai/scoring";
import { useAppStore } from "../../store/useAppStore";
import { components, palette, radii, spacing, tokens, type, type PipState } from "../../theme";
import { ConditionsChipRow } from "./ConditionsChipRow";
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

	const viewState = useMemo(() => buildTriggerProfileViewState(insights), [insights]);
	const conditions = profile?.knownConditions ?? [];
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

	let rowIndex = 0;

	return (
		<>
			<AppScreen>
				<TabScreenHeader title="Your Trigger Profile" />

				{isWaitingForComputedData ? (
					<HeroSkeleton />
				) : (
					<HeroSummaryCard
						learningProgress={learningProgress}
						onOpenLearningInfo={() => setLearningInfoVisible(true)}
					/>
				)}

				<ConditionsChipRow
					conditions={conditions}
					onEdit={() => navigation.navigate("Settings", { section: "conditions" })}
				/>

				{!isWaitingForComputedData ? (
					<View style={styles.countsBlock}>
						<Text style={styles.countsTitle}>Digestive Patterns</Text>
						<View style={styles.heroCountsRow}>
							<HeroCount
								value={viewState.counts.confirmed}
								label="Confirmed"
								color={tokens.color.status.risk.high.tint}
							/>
							<HeroCount
								value={viewState.counts.suspects}
								label="Under review"
								color={tokens.color.status.risk.medium.tint}
							/>
							<HeroCount
								value={viewState.counts.cleared}
								label="Cleared"
								color={tokens.color.status.risk.low.tint}
							/>
						</View>
					</View>
				) : null}

				{!isWaitingForComputedData && viewState.allSeeded ? (
					<SectionCard style={styles.seedBanner}>
						<Pip state="thinking" size={44} />
						<Text style={styles.seedBannerText}>
							These suspects come straight from your answers. Daily check-ins confirm
							or clear each one with real evidence.
						</Text>
					</SectionCard>
				) : null}

				{isWaitingForComputedData ? (
					<ListSkeleton rows={4} />
				) : viewState.sections.length === 0 && viewState.trackedFamilies.length === 0 ? (
					<EmptyHint
						pipState="thinking"
						title="Your Trigger Profile starts here"
						subtitle="Scan meals and file daily check-ins — suspects, confirmed triggers, and safe foods build up on this screen."
					/>
				) : (
					viewState.sections.map((section) => (
						<View key={section.status} style={styles.section}>
							<View style={styles.sectionHeader}>
								<View style={styles.sectionTitleRow}>
									<Text style={styles.sectionTitle}>{section.title}</Text>
									<View style={styles.sectionTitleSpacer} />
									<Text style={styles.sectionCountText}>
										{section.entries.length}
									</Text>
								</View>
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
												emoji={entry.group.emoji}
												extraDetail={entry.memberSummary}
												onPress={() =>
													openGroup(
														entry.group.key,
														entry.group.label,
													)
												}
											/>
										</Animated.View>
									);
								})}
							</View>
						</View>
					))
				)}

				{!isWaitingForComputedData && viewState.trackedFamilies.length > 0 ? (
					<View style={styles.familyBlock}>
						<Pressable
							accessibilityRole="button"
							onPress={() => setFamiliesExpanded((current) => !current)}
							style={({ pressed }) => [
								styles.familyToggle,
								pressed && { opacity: 0.85 },
							]}
						>
							<Ionicons
								name={familiesExpanded ? "chevron-down" : "chevron-forward"}
								size={15}
								color={palette.textMuted}
							/>
							<Text style={styles.familyToggleText}>
								Foods we are tracking
							</Text>
							<Text style={styles.familyToggleCount}>{viewState.trackedFamilies.length}</Text>
						</Pressable>
						<Text style={styles.familyIntro}>
							Food coverage from your scans. These are not trigger verdicts yet.
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
			</AppScreen>
			<LearningStageInfoModal
				visible={learningInfoVisible}
				onClose={() => setLearningInfoVisible(false)}
				learningProgress={learningProgress}
			/>
		</>
	);
}

function familyMeta(foodCount: number, evidenceCount: number) {
	const foods = `${foodCount} food${foodCount === 1 ? "" : "s"}`;
	if (evidenceCount <= 0) return foods;
	return `${foods} tracked across ${evidenceCount} paired day${evidenceCount === 1 ? "" : "s"}`;
}

function HeroSummaryCard({
	learningProgress,
	onOpenLearningInfo,
}: {
	learningProgress: ProfileLearningProgress;
	onOpenLearningInfo: () => void;
}) {
	const stageLabel =
		learningProgress.stage === "confident"
			? "Confident"
			: learningProgress.stage === "growing"
				? "Growing"
				: "Early";
	const pipState: PipState =
		learningProgress.stage === "confident"
			? "joy"
			: learningProgress.stage === "growing"
				? "subtle"
				: "thinking";

	return (
		<View style={styles.heroStack}>
			<SectionCard style={styles.heroCard}>
				<LinearGradient
					colors={[...components.scanCta.gradient]}
					start={{ x: 0, y: 0 }}
					end={{ x: 1, y: 1 }}
					style={StyleSheet.absoluteFill}
				/>
				<View style={styles.heroCopy}>
					<Text style={styles.heroKicker}>Learning stage</Text>
					<Text style={styles.learningPercent}>{learningProgress.percent}%</Text>
					<View style={styles.learningStageBubble}>
						<Text style={styles.learningStage}>{stageLabel}</Text>
					</View>
					<View style={styles.learningProgressTrack}>
						<View
							style={[
								styles.learningProgressFill,
								{ width: `${learningProgress.percent}%` },
							]}
						/>
					</View>
				</View>
				<View style={styles.heroPip}>
					<Pip state={pipState} size={104} />
				</View>
			</SectionCard>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="What is learning stage?"
				onPress={onOpenLearningInfo}
				style={({ pressed }) => [styles.learningCue, pressed && { opacity: 0.84 }]}
			>
				<Ionicons name="sparkles-outline" size={13} color={palette.primary} />
				<Text style={styles.learningCueText}>
					{learningProgress.pairedReportDays}/{learningProgress.confidentReportDays}{" "}
					symptom-report days · {learningProgress.pairedMealScans}/
					{learningProgress.confidentMealScans} meal scans paired
				</Text>
				<Ionicons name="chevron-forward" size={14} color={palette.primary} />
			</Pressable>

		</View>
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
			<Ionicons name={icon} size={20} color={palette.primary} />
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
				<Ionicons name={icon} size={18} color={palette.primary} />
			</View>
			<View style={styles.learningModalStepCopy}>
				<Text style={styles.learningModalStepTitle}>{title}</Text>
				<Text style={styles.learningModalStepBody}>{body}</Text>
			</View>
		</View>
	);
}

function HeroCount({ value, label, color }: { value: number; label: string; color: string }) {
	return (
		<View style={styles.heroCount}>
			<Text style={[styles.heroCountValue, { color }]}>{value}</Text>
			<Text style={styles.heroCountLabel}>{label}</Text>
		</View>
	);
}

export function EmptyHint({
	pipState,
	title,
	subtitle,
}: {
	pipState: PipState;
	title: string;
	subtitle: string;
}) {
	return (
		<SectionCard style={styles.emptyHintCard}>
			<View style={styles.emptyHintBadge}>
				<Pip state={pipState} size={48} />
			</View>
			<View style={styles.emptyHintCopy}>
				<Text style={styles.emptyHintTitle}>{title}</Text>
				<Text style={styles.emptyHintSubtitle}>{subtitle}</Text>
			</View>
		</SectionCard>
	);
}

function HeroSkeleton() {
	return (
		<View style={styles.heroStack}>
			<SectionCard style={styles.heroCard}>
				<View style={styles.heroCopy}>
					<SkeletonBlock width="54%" height={14} radius={radii.sm} />
					<SkeletonBlock width={96} height={46} radius={radii.md} />
					<SkeletonBlock width="72%" height={22} radius={radii.sm} />
					<SkeletonBlock width="88%" height={7} radius={radii.pill} />
				</View>
				<SkeletonBlock width={96} height={112} radius={48} />
			</SectionCard>
			<View style={styles.heroCountsRow}>
				<SkeletonBlock width="31%" height={86} radius={radii.lg} />
				<SkeletonBlock width="31%" height={86} radius={radii.lg} />
				<SkeletonBlock width="31%" height={86} radius={radii.lg} />
			</View>
			<SkeletonBlock width="100%" height={42} radius={radii.lg} />
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
	heroStack: {
		gap: spacing.sm,
	},
	heroCard: {
		minHeight: 170,
		flexDirection: "row",
		alignItems: "stretch",
		overflow: "hidden",
		borderColor: "rgba(91, 151, 123, 0.18)",
		padding: spacing.lg,
	},
	heroCopy: {
		flex: 1,
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	heroKicker: {
		color: "#FFFFFF",
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	learningPercent: {
		color: "#FFFFFF",
		fontFamily: type.body.bold,
		fontSize: 42,
		lineHeight: 46,
		letterSpacing: 0,
	},
	learningStageBubble: {
		alignSelf: "flex-start",
		borderRadius: radii.pill,
		backgroundColor: "#FFFFFF",
		paddingHorizontal: 10,
		paddingVertical: 4,
	},
	learningStage: {
		color: "#4F8B70",
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 16,
		letterSpacing: 0.2,
	},
	learningProgressTrack: {
		width: "88%",
		height: 7,
		overflow: "hidden",
		borderRadius: radii.pill,
		backgroundColor: "rgba(255,255,255,0.74)",
	},
	learningProgressFill: {
		height: "100%",
		minWidth: 8,
		borderRadius: radii.pill,
		backgroundColor: palette.primary,
	},
	heroPip: {
		width: 116,
		alignItems: "center",
		justifyContent: "flex-end",
		marginRight: -spacing.md,
		marginBottom: -spacing.lg,
	},
	countsBlock: {
		gap: spacing.xs,
	},
	countsTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	heroCountsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	heroCount: {
		flex: 1,
		alignItems: "center",
		gap: 4,
		minHeight: 86,
		justifyContent: "center",
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		...tokens.shadow.card,
	},
	heroCountValue: {
		fontFamily: type.body.bold,
		fontSize: 28,
		lineHeight: 32,
	},
	heroCountLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	learningCue: {
		minHeight: 42,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		...tokens.shadow.card,
	},
	learningCueText: {
		flex: 1,
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	learningModalStats: {
		width: "100%",
		flexDirection: "row",
		gap: spacing.xs,
		marginTop: spacing.sm,
	},
	learningModalStat: {
		flex: 1,
		minHeight: 94,
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
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
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
		padding: spacing.sm,
	},
	learningModalStepIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: palette.sageSoft,
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
	seedBannerText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
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
		alignItems: "center",
		gap: spacing.xs,
	},
	sectionTitle: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	sectionTitleSpacer: {
		flex: 1,
	},
	sectionCountText: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	listStack: {
		gap: spacing.xs,
	},
	emptyHintCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	emptyHintBadge: {
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: palette.sageSoft,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyHintCopy: {
		flex: 1,
		gap: 4,
	},
	emptyHintTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		letterSpacing: 0,
	},
	emptyHintSubtitle: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
	skeletonRow: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
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
		color: palette.textMuted,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	familyToggleCount: {
		color: palette.textMuted,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
	},
	familyIntro: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
		paddingHorizontal: spacing.sm,
		marginTop: -spacing.xs,
	},
	familyList: {
		gap: spacing.xs,
	},
	familyRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
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
		backgroundColor: palette.sageSoft,
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
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	familyRowMeta: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 11,
		lineHeight: 15,
	},
});

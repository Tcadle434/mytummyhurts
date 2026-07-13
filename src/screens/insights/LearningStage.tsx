import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { InfoModal } from "../../components/modals/InfoModal";
import type { ProfileLearningProgress } from "../../services/ai/scoring";
import { radii, spacing, tokens, type } from "../../theme";

type LearningStageProps = {
	learningProgress: ProfileLearningProgress;
};

// The learning-stage card, demoted from hero to supporting cue: same content
// (stage, percent, paired counts), quieter surface, one tap for the full story.
export function LearningStageCue({
	learningProgress,
	onOpen,
}: LearningStageProps & { onOpen: () => void }) {
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

export function LearningStageInfoModal({
	visible,
	onClose,
	learningProgress,
}: LearningStageProps & { visible: boolean; onClose: () => void }) {
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

const styles = StyleSheet.create({
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
	// Porcelain tiles inside the white modal sheet: quiet separation without
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
});

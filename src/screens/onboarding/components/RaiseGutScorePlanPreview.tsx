import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type PlanVisual = "scan" | "symptoms" | "patterns";

const PLAN_STEPS: {
	step: string;
	iconName: IoniconName;
	title: string;
	body: string;
	visual: PlanVisual;
}[] = [
	{
		step: "1",
		iconName: "camera-outline",
		title: "Scan the food you eat",
		body: "Meals become ingredient evidence your Gut Score can learn from.",
		visual: "scan",
	},
	{
		step: "2",
		iconName: "pulse-outline",
		title: "Report daily symptoms",
		body: "One quick gut check tells us how that day actually felt.",
		visual: "symptoms",
	},
	{
		step: "3",
		iconName: "sparkles-outline",
		title: "Isolate patterns and learn from risk scores",
		body: "The app connects foods, symptoms, and risk scores into personal patterns.",
		visual: "patterns",
	},
];

/**
 * Compact onboarding preview for the core learning loop. This is intentionally
 * presentational: onboarding copy and score computation remain owned by the
 * flow, while this component owns the reusable card layout.
 */
export function RaiseGutScorePlanPreview() {
	return (
		<View style={styles.wrap}>
			<View style={styles.headerCard}>
				<View style={styles.headerIcon}>
					<Ionicons name="finger-print-outline" size={22} color={palette.primary} />
				</View>
				<View style={styles.headerCopy}>
					<Text style={styles.headerTitle}>Personalized learning loop</Text>
					<Text style={styles.headerText}>
						Your answers set the baseline. Your real days teach the app what matters.
					</Text>
				</View>
			</View>
			<View style={styles.steps}>
				{PLAN_STEPS.map((step) => (
					<RaiseGutScorePlanStep key={step.step} {...step} />
				))}
			</View>
		</View>
	);
}

function RaiseGutScorePlanStep({
	step,
	iconName,
	title,
	body,
	visual,
}: {
	step: string;
	iconName: IoniconName;
	title: string;
	body: string;
	visual: PlanVisual;
}) {
	return (
		<View style={styles.stepCard}>
			<View style={styles.stepTop}>
				<View style={styles.numberBadge}>
					<Text style={styles.numberText}>{step}</Text>
				</View>
				<View style={styles.iconBubble}>
					<Ionicons name={iconName} size={22} color={palette.primary} />
				</View>
				<View style={styles.stepCopy}>
					<Text style={styles.stepTitle}>{title}</Text>
					<Text style={styles.stepBody}>{body}</Text>
				</View>
			</View>
			<RaiseGutScorePlanVisual visual={visual} />
		</View>
	);
}

function RaiseGutScorePlanVisual({ visual }: { visual: PlanVisual }) {
	if (visual === "scan") {
		return (
			<View style={styles.visualRow}>
				<View style={styles.miniFoodCard}>
					<Ionicons name="restaurant-outline" size={17} color={palette.primary} />
					<Text style={styles.miniFoodText}>Food logged</Text>
				</View>
				<View style={styles.miniChip}>
					<Text style={styles.miniChipText}>Ingredients</Text>
				</View>
			</View>
		);
	}

	if (visual === "symptoms") {
		return (
			<View style={styles.visualRow}>
				<View style={styles.symptomScale}>
					<View
						style={[
							styles.symptomScaleFill,
							{ backgroundColor: tokens.color.status.risk.low.tint },
						]}
					/>
					<View
						style={[
							styles.symptomScaleFill,
							{ backgroundColor: tokens.color.status.risk.medium.tint },
						]}
					/>
					<View
						style={[
							styles.symptomScaleFill,
							{ backgroundColor: tokens.color.status.risk.high.tint },
						]}
					/>
				</View>
				<Text style={styles.symptomScaleText}>Daily gut check</Text>
			</View>
		);
	}

	return (
		<View style={styles.patternPanel}>
			<View style={styles.patternCopy}>
				<Text style={styles.patternTitle}>Tomato + reflux</Text>
				<View style={styles.patternBarTrack}>
					<View style={styles.patternBarFill} />
				</View>
			</View>
			<Ionicons name="trending-up-outline" size={20} color={tokens.color.status.risk.high.foreground} />
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		gap: spacing.sm,
	},
	headerCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.success,
		padding: spacing.sm,
	},
	headerIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	headerCopy: {
		flex: 1,
		gap: 2,
	},
	headerTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
	},
	headerText: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 17,
	},
	steps: {
		gap: spacing.xs,
	},
	stepCard: {
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.sm,
		gap: spacing.xs,
		...tokens.shadow.card,
	},
	stepTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
	},
	numberBadge: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	numberText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
	},
	iconBubble: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	stepCopy: {
		flex: 1,
		gap: 3,
	},
	stepTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	stepBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 11,
		lineHeight: 15,
	},
	visualRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingLeft: 58,
	},
	miniFoodCard: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 14,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
	},
	miniFoodText: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	miniChip: {
		minHeight: 26,
		borderRadius: 13,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	miniChipText: {
		color: tokens.color.status.success.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	symptomScale: {
		flex: 1,
		maxWidth: 150,
		height: 8,
		flexDirection: "row",
		borderRadius: 4,
		overflow: "hidden",
		backgroundColor: tokens.color.chart.track,
	},
	symptomScaleFill: {
		flex: 1,
		height: "100%",
	},
	symptomScaleText: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 15,
	},
	patternPanel: {
		marginLeft: 58,
		minHeight: 36,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.status.risk.high.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
	},
	patternCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	patternTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	patternBarTrack: {
		height: 7,
		borderRadius: 4,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	patternBarFill: {
		width: "78%",
		height: "100%",
		borderRadius: 4,
		backgroundColor: tokens.color.status.risk.high.tint,
	},
});

import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type TimelineTone = "start" | "mid" | "goal";

const TIMELINE_STEPS: {
	phase: string;
	title: string;
	iconName: IoniconName;
	tone: TimelineTone;
}[] = [
	{
		phase: "Day 1",
		title: "Start scanning",
		iconName: "camera-outline",
		tone: "start",
	},
	{
		phase: "Week 1",
		title: "Symptoms reveal patterns",
		iconName: "pulse-outline",
		tone: "mid",
	},
	{
		phase: "Week 2",
		title: "Gut Score adapts to you",
		iconName: "sparkles",
		tone: "goal",
	},
];

const AVG_USER_SCORE_AFTER_MONTH = 80;
const NODE_SIZE = 42;
const NODE_COLUMN_WIDTH = 64;
const CONNECTOR_WIDTH = 2;
const CONNECTOR_HEIGHT = 28;

/**
 * Onboarding preview that frames personalization as a timeline rather than a
 * card stack. Three nodes on a connecting line; node color intensifies along
 * the path so the visual reinforces "calmer over time." A second card shows a
 * concrete before/after stat against the MyTummyHurts user average.
 */
export function RaiseGutScorePlanPreview({ currentScore = 0 }: { currentScore?: number }) {
	return (
		<View style={styles.wrap}>
			<View style={styles.card}>
				<View style={styles.timeline}>
					{TIMELINE_STEPS.map((step, index) => (
						<Fragment key={step.phase}>
							<TimelineStep
								phase={step.phase}
								title={step.title}
								iconName={step.iconName}
								tone={step.tone}
							/>
							{index < TIMELINE_STEPS.length - 1 ? (
								<View style={styles.connectorRow}>
									<View
										style={[
											styles.connector,
											{ backgroundColor: nodeColors(step.tone).line },
										]}
									/>
								</View>
							) : null}
						</Fragment>
					))}
				</View>

				<View style={styles.captionRow}>
					<Ionicons name="infinite-outline" size={16} color={tokens.color.text.accent} />
					<Text style={styles.caption}>
						Your Gut Score gets more personalized every week.
					</Text>
				</View>
			</View>

			<ScoreComparison currentScore={currentScore} />
		</View>
	);
}

function TimelineStep({
	phase,
	title,
	iconName,
	tone,
}: {
	phase: string;
	title: string;
	iconName: IoniconName;
	tone: TimelineTone;
}) {
	const colors = nodeColors(tone);

	return (
		<View style={styles.step}>
			<View style={styles.nodeColumn}>
				<View style={[styles.nodeRing, { borderColor: colors.ring }]}>
					<View style={[styles.node, { backgroundColor: colors.fill }]}>
						<Ionicons name={iconName} size={20} color={colors.icon} />
					</View>
				</View>
			</View>
			<View style={styles.copy}>
				<Text style={[styles.phaseLabel, { color: colors.phase }]}>{phase}</Text>
				<Text style={styles.stepTitle}>{title}</Text>
			</View>
		</View>
	);
}

function ScoreComparison({ currentScore }: { currentScore: number }) {
	const clampedCurrent = Math.max(0, Math.min(100, Math.round(currentScore)));
	// Text-grade band color (never the tint) so the numeral reads on white.
	const currentColor = gutScoreForeground(clampedCurrent);

	return (
		<View style={styles.comparisonCard}>
			<Text style={styles.comparisonHeader}>After 1 month with MyTummyHurts</Text>
			<View style={styles.comparisonRow}>
				<View style={styles.comparisonColumn}>
					<Text style={styles.comparisonEyebrow}>You today</Text>
					<Text style={[styles.comparisonScore, { color: currentColor }]}>
						{clampedCurrent}%
					</Text>
				</View>
				<View style={styles.comparisonArrow}>
					<Ionicons name="arrow-forward" size={20} color={tokens.color.text.tertiary} />
				</View>
				<View style={styles.comparisonColumn}>
					<Text style={styles.comparisonEyebrow}>Avg user</Text>
					<Text style={[styles.comparisonScore, { color: palette.primary }]}>
						{AVG_USER_SCORE_AFTER_MONTH}%
					</Text>
				</View>
			</View>
		</View>
	);
}

// Same banding as gutScoreTint in utils/risk, but the darker text-grade
// foreground colors — tints are fills and fail contrast as text.
function gutScoreForeground(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.foreground;
	if (score >= 34) return tokens.color.status.risk.medium.foreground;
	return tokens.color.status.risk.high.foreground;
}

function nodeColors(tone: TimelineTone) {
	if (tone === "start" || tone === "mid") {
		return {
			fill: tokens.color.status.success.background,
			ring: tokens.color.status.success.background,
			icon: tokens.color.status.success.foreground,
			phase: tokens.color.status.success.foreground,
			line: tokens.color.status.success.background,
		};
	}

	return {
		fill: palette.primary,
		ring: tokens.color.status.success.background,
		icon: tokens.color.text.inverse,
		phase: palette.primary,
		line: palette.primary,
	};
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		gap: spacing.sm,
	},
	card: {
		width: "100%",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.lg,
		paddingBottom: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	timeline: {
		width: "100%",
	},
	step: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	nodeColumn: {
		width: NODE_COLUMN_WIDTH - spacing.md,
		alignItems: "center",
	},
	nodeRing: {
		width: NODE_SIZE + 8,
		height: NODE_SIZE + 8,
		borderRadius: (NODE_SIZE + 8) / 2,
		borderWidth: 4,
		alignItems: "center",
		justifyContent: "center",
	},
	node: {
		width: NODE_SIZE,
		height: NODE_SIZE,
		borderRadius: NODE_SIZE / 2,
		alignItems: "center",
		justifyContent: "center",
	},
	copy: {
		flex: 1,
		gap: 2,
	},
	phaseLabel: {
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	stepTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 21,
	},
	connectorRow: {
		width: NODE_COLUMN_WIDTH - spacing.md,
		alignItems: "center",
	},
	connector: {
		width: CONNECTOR_WIDTH,
		height: CONNECTOR_HEIGHT,
		borderRadius: CONNECTOR_WIDTH / 2,
	},
	captionRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		borderTopWidth: 1,
		borderTopColor: tokens.color.border.subtle,
		paddingTop: spacing.sm,
	},
	caption: {
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	comparisonCard: {
		width: "100%",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		gap: spacing.sm,
		...tokens.shadow.card,
	},
	comparisonHeader: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
		textAlign: "center",
	},
	comparisonRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	comparisonColumn: {
		flex: 1,
		alignItems: "center",
		gap: 2,
	},
	comparisonEyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	comparisonScore: {
		fontFamily: type.body.bold,
		fontSize: 32,
		lineHeight: 36,
		fontVariant: ["tabular-nums"],
		letterSpacing: -0.6,
	},
	comparisonArrow: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
});

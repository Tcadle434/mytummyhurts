import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { palette, spacing, tokens, type } from "../../../theme";

export type PhaseDiscoveryState = "scan" | "loading" | "result";

const CREAMY_TOMATO_PASTA_SCAN = require("../../../../assets/ui/creamy_tomato_pasta_scan.png");

/**
 * Phase 1 is the only onboarding graphic with internal scan -> loading ->
 * result states. Keeping it isolated makes the main flow responsible only for
 * state transitions and CTA behavior.
 */
export function PhaseDiscoveryGraphic({ state }: { state: PhaseDiscoveryState }) {
	return (
		<View style={styles.card}>
			<View style={styles.header}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>1</Text>
				</View>
				<View style={styles.headerCopy}>
					<Text style={styles.eyebrow}>Discovery</Text>
					<Text style={styles.title}>Adaptive risk scores</Text>
				</View>
			</View>

			<View style={styles.stage}>
				{state === "scan" ? <DiscoveryScanPreview /> : null}
				{state === "loading" ? <DiscoveryAnalyzingState /> : null}
				{state === "result" ? <DiscoveryRiskResult /> : null}
			</View>
		</View>
	);
}

function DiscoveryScanPreview() {
	return (
		<View style={styles.scanCard}>
			<Image
				source={CREAMY_TOMATO_PASTA_SCAN}
				style={styles.scanImage}
				resizeMode="cover"
				accessibilityIgnoresInvertColors
			/>
			<View style={styles.scanOverlay}>
				<View style={styles.mealScanChip}>
					<Ionicons name="camera-outline" size={15} color={tokens.color.icon.accent} />
					<Text style={styles.mealScanChipText}>Meal scan</Text>
				</View>
				<View style={styles.scanReadyBadge}>
					<Ionicons name="scan-outline" size={15} color={tokens.color.utility.white} />
				</View>
			</View>
		</View>
	);
}

function DiscoveryAnalyzingState() {
	return (
		<View style={[styles.scanCard, styles.analyzingCard]}>
			<View style={styles.analyzingIconWrap}>
				<ActivityIndicator color={palette.primary} />
			</View>
			<Text style={styles.analyzingTitle}>Analyzing meal...</Text>
			<Text style={styles.analyzingBody}>
				Finding ingredients and matching them to your history.
			</Text>
			<View style={styles.analyzingDotRow}>
				<View style={styles.analyzingDot} />
				<View style={[styles.analyzingDot, styles.analyzingDotMuted]} />
				<View style={[styles.analyzingDot, styles.analyzingDotMuted]} />
			</View>
		</View>
	);
}

function DiscoveryRiskResult() {
	return (
		<View style={styles.resultCard}>
			<View style={styles.resultHeaderRow}>
				<View style={styles.resultTitleStack}>
					<Text style={styles.eyebrow}>Scanned dish</Text>
					<Text style={styles.resultDishTitle}>Creamy tomato pasta</Text>
				</View>
				<View style={styles.highRiskPill}>
					<Ionicons
						name="alert-circle"
						size={15}
						color={tokens.color.status.risk.high.foreground}
					/>
					<Text style={styles.highRiskPillText}>High risk</Text>
				</View>
			</View>
			<View style={styles.resultScoreRow}>
				<AdaptiveRiskGauge />
				<View style={styles.resultInsightCard}>
					<Text style={styles.adaptiveRiskTitle}>Tomato keeps showing up</Text>
					<Text style={styles.adaptiveRiskBody}>
						Tomato has been a consistent trigger in your reflux symptom reports.
					</Text>
				</View>
			</View>
			<View style={styles.resultChipRow}>
				<ResultIngredientChip label="Tomato" tone="high" />
				<ResultIngredientChip label="Cream" tone="medium" />
				<ResultIngredientChip label="Garlic" tone="medium" />
			</View>
		</View>
	);
}

function ResultIngredientChip({ label, tone }: { label: string; tone: "high" | "medium" }) {
	const toneStyle = tone === "high" ? styles.ingredientChipHigh : styles.ingredientChipMedium;
	const textStyle =
		tone === "high" ? styles.ingredientChipTextHigh : styles.ingredientChipTextMedium;

	return (
		<View style={[styles.ingredientChip, toneStyle]}>
			<Text style={[styles.ingredientChipText, textStyle]}>{label}</Text>
		</View>
	);
}

function AdaptiveRiskGauge() {
	const centerX = 68;
	const centerY = 66;
	const radius = 39;
	const needleEnd = polarPoint(centerX, centerY, 31, 48);

	return (
		<View style={styles.adaptiveGaugeWrap} accessible accessibilityLabel="High risk gauge">
			<Svg width={136} height={80} viewBox="0 0 136 80">
				<Path
					d={gaugeArcPath(centerX, centerY, radius, -116, -42)}
					stroke={tokens.color.status.risk.low.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
					opacity={0.38}
				/>
				<Path
					d={gaugeArcPath(centerX, centerY, radius, -25, 25)}
					stroke={tokens.color.status.risk.medium.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
					opacity={0.62}
				/>
				<Path
					d={gaugeArcPath(centerX, centerY, radius, 42, 116)}
					stroke={tokens.color.status.risk.high.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
				/>
				<Path
					d={`M ${centerX} ${centerY} L ${needleEnd.x} ${needleEnd.y}`}
					stroke={tokens.color.status.risk.high.foreground}
					strokeWidth={5}
					strokeLinecap="round"
					fill="none"
				/>
				<Circle
					cx={centerX}
					cy={centerY}
					r={9}
					fill={tokens.color.status.risk.high.foreground}
				/>
				<Circle cx={centerX} cy={centerY} r={4} fill={tokens.color.surface.card.default} />
			</Svg>
			<Text style={styles.adaptiveGaugeValue}>78</Text>
			<Text style={styles.adaptiveGaugeLabel}>risk score</Text>
		</View>
	);
}

function gaugeArcPath(
	cx: number,
	cy: number,
	radius: number,
	startAngle: number,
	endAngle: number
) {
	const start = polarPoint(cx, cy, radius, endAngle);
	const end = polarPoint(cx, cy, radius, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

	return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarPoint(cx: number, cy: number, radius: number, angleInDegrees: number) {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

	return {
		x: cx + radius * Math.cos(angleInRadians),
		y: cy + radius * Math.sin(angleInRadians),
	};
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	phaseNumberBadge: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	phaseNumber: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 26,
	},
	headerCopy: {
		flex: 1,
		gap: 2,
	},
	eyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	stage: {
		minHeight: 268,
		justifyContent: "center",
	},
	scanCard: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	scanImage: {
		width: "100%",
		height: 268,
	},
	scanOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "space-between",
		padding: spacing.sm,
	},
	mealScanChip: {
		alignSelf: "flex-start",
		minHeight: 30,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 99,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		...tokens.shadow.card,
	},
	mealScanChipText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	scanReadyBadge: {
		alignSelf: "flex-end",
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	analyzingCard: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		padding: spacing.lg,
	},
	analyzingIconWrap: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	analyzingTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	analyzingBody: {
		maxWidth: 230,
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
	},
	analyzingDotRow: {
		flexDirection: "row",
		gap: 5,
		marginTop: spacing.xs,
	},
	analyzingDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: palette.primary,
	},
	analyzingDotMuted: {
		opacity: 0.32,
	},
	resultCard: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	resultHeaderRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	resultTitleStack: {
		flex: 1,
		gap: 2,
	},
	resultDishTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	resultScoreRow: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: spacing.md,
	},
	resultInsightCard: {
		flex: 1,
		justifyContent: "center",
		borderLeftWidth: 1,
		borderLeftColor: tokens.color.border.subtle,
		paddingLeft: spacing.md,
		gap: spacing.xs,
	},
	resultChipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	ingredientChip: {
		minHeight: 28,
		justifyContent: "center",
		borderRadius: 99,
		paddingHorizontal: spacing.sm,
	},
	ingredientChipHigh: {
		backgroundColor: tokens.color.status.risk.high.background,
	},
	ingredientChipMedium: {
		backgroundColor: tokens.color.status.risk.medium.background,
	},
	ingredientChipText: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	ingredientChipTextHigh: {
		color: tokens.color.status.risk.high.foreground,
	},
	ingredientChipTextMedium: {
		color: tokens.color.status.risk.medium.foreground,
	},
	adaptiveGaugeWrap: {
		width: 136,
		height: 124,
		alignItems: "center",
		justifyContent: "flex-start",
		marginLeft: -spacing.xs,
	},
	adaptiveGaugeValue: {
		color: tokens.color.status.risk.high.tint,
		fontFamily: type.body.bold,
		fontSize: 28,
		lineHeight: 31,
		fontVariant: ["tabular-nums"],
		marginTop: 3,
	},
	adaptiveGaugeLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
	},
	highRiskPill: {
		alignSelf: "flex-start",
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.risk.high.background,
		paddingHorizontal: spacing.sm,
	},
	highRiskPillText: {
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	adaptiveRiskTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 21,
	},
	adaptiveRiskBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
});

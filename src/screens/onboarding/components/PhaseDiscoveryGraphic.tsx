import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { palette, spacing, tokens, type } from "../../../theme";
import { riskLevelTint } from "../../../utils/risk";

export type PhaseDiscoveryState = "scan" | "loading" | "result";

const CREAMY_TOMATO_PASTA_SCAN = require("../../../../assets/ui/creamy_tomato_pasta_scan.png");

/**
 * Phase 1 is the only onboarding graphic with internal scan -> loading ->
 * result states. The single outer card frames every state so transitions
 * feel like the same surface changing, not three different screens.
 */
export function PhaseDiscoveryGraphic({ state }: { state: PhaseDiscoveryState }) {
	return (
		<View style={styles.card}>
			<PhaseHeader number="1" eyebrow="Discovery" title="Adaptive risk scores" />

			<View style={styles.stage}>
				{state === "scan" ? <DiscoveryScanPreview /> : null}
				{state === "loading" ? <DiscoveryAnalyzingState /> : null}
				{state === "result" ? <DiscoveryRiskResult /> : null}
			</View>
		</View>
	);
}

function PhaseHeader({
	number,
	eyebrow,
	title,
}: {
	number: string;
	eyebrow: string;
	title: string;
}) {
	return (
		<View style={styles.header}>
			<View style={styles.phaseNumberBadge}>
				<Text style={styles.phaseNumber}>{number}</Text>
			</View>
			<View style={styles.headerCopy}>
				<Text style={styles.eyebrow}>{eyebrow}</Text>
				<Text style={styles.title}>{title}</Text>
			</View>
		</View>
	);
}

function DiscoveryScanPreview() {
	return (
		<View style={styles.scanFrame}>
			<Image
				source={CREAMY_TOMATO_PASTA_SCAN}
				style={styles.scanImage}
				resizeMode="cover"
				accessibilityIgnoresInvertColors
			/>
			<View style={styles.scanOverlay} pointerEvents="none">
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
		<View style={styles.analyzingWrap}>
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
		<View style={styles.resultStage}>
			<View style={styles.dishRow}>
				<View style={styles.dishCopy}>
					<Text style={styles.eyebrowSmall}>Scanned dish</Text>
					<Text style={styles.dishTitle}>Creamy tomato pasta</Text>
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

			<View style={styles.resultRow}>
				<View style={styles.dialColumn}>
					<RiskScoreDial score={78} tone="high" />
				</View>

				<View style={styles.insightPanel}>
					<LinearGradient
						colors={[
							tokens.color.status.risk.high.background,
							tokens.color.status.risk.high.background,
							tokens.color.surface.card.default,
						]}
						locations={[0, 0.45, 1]}
						style={StyleSheet.absoluteFill}
					/>
					<View style={styles.insightTop}>
						<View style={styles.insightHeader}>
							<View style={styles.insightIcon}>
								<Ionicons
									name="pulse-outline"
									size={17}
									color={tokens.color.status.risk.high.foreground}
								/>
							</View>
							<Text style={styles.insightTitle}>Tomato keeps showing up</Text>
						</View>
						<Text style={styles.insightBody}>
							A consistent trigger in your reflux reports.
						</Text>
					</View>
					<View style={styles.insightDivider} />
					<View style={styles.insightBottom}>
						<View style={styles.chipRow}>
							<ResultIngredientChip label="Tomato" tone="high" />
						</View>
						<View style={styles.chipRow}>
							<ResultIngredientChip label="Cream" tone="medium" />
							<ResultIngredientChip label="Garlic" tone="medium" />
						</View>
					</View>
				</View>
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

function RiskScoreDial({
	score,
	tone,
}: {
	score: number;
	tone: "high" | "medium" | "low";
}) {
	const size = 124;
	const strokeWidth = 12;
	const radius = (size - strokeWidth) / 2;
	const center = size / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.max(0, Math.min(100, score));
	const dashOffset = circumference * (1 - clamped / 100);
	const ringColor = riskLevelTint(tone);

	return (
		<View
			style={styles.dialWrap}
			accessible
			accessibilityLabel={`Risk score ${clamped} out of 100`}
		>
			<Svg width={size} height={size}>
				<Circle
					cx={center}
					cy={center}
					r={radius}
					stroke={tokens.color.chart.track}
					strokeWidth={strokeWidth}
					fill="none"
				/>
				<Circle
					cx={center}
					cy={center}
					r={radius}
					stroke={ringColor}
					strokeWidth={strokeWidth}
					strokeLinecap="round"
					strokeDasharray={`${circumference} ${circumference}`}
					strokeDashoffset={dashOffset}
					fill="none"
					rotation={-90}
					origin={`${center}, ${center}`}
				/>
			</Svg>
			<View style={styles.dialCenter} pointerEvents="none">
				<Text style={[styles.dialScore, { color: ringColor }]}>{clamped}</Text>
				<Text style={styles.dialLabel}>Risk score</Text>
			</View>
		</View>
	);
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
		gap: spacing.sm,
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
	eyebrowSmall: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	stage: {
		minHeight: 260,
		justifyContent: "center",
	},
	scanFrame: {
		width: "100%",
		height: 252,
		borderRadius: 22,
		overflow: "hidden",
		backgroundColor: tokens.color.surface.card.warm,
	},
	scanImage: {
		width: "100%",
		height: "100%",
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
	analyzingWrap: {
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingVertical: spacing.xl,
	},
	analyzingIconWrap: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	analyzingTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
		marginTop: spacing.xs,
	},
	analyzingBody: {
		maxWidth: 240,
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
	},
	analyzingDotRow: {
		flexDirection: "row",
		gap: 6,
		marginTop: spacing.sm,
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
	resultStage: {
		width: "100%",
		gap: spacing.md,
	},
	dishRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	dishCopy: {
		flex: 1,
		gap: 2,
	},
	dishTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	highRiskPill: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.risk.high.background,
		paddingHorizontal: spacing.sm,
		marginTop: 2,
	},
	highRiskPillText: {
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	resultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	dialColumn: {
		alignItems: "center",
		justifyContent: "center",
	},
	dialWrap: {
		width: 124,
		height: 124,
		alignItems: "center",
		justifyContent: "center",
	},
	dialCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	dialScore: {
		fontFamily: type.body.bold,
		fontSize: 38,
		lineHeight: 42,
		fontVariant: ["tabular-nums"],
		letterSpacing: -0.6,
	},
	dialLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 10,
		lineHeight: 12,
		letterSpacing: 0.8,
		textTransform: "uppercase",
		marginTop: 2,
	},
	insightPanel: {
		flex: 1,
		borderRadius: 20,
		overflow: "hidden",
	},
	insightTop: {
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingTop: spacing.sm,
		paddingBottom: spacing.sm,
	},
	insightHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	insightIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	insightTitle: {
		flex: 1,
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	insightBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	insightDivider: {
		height: 1,
		marginHorizontal: spacing.sm,
		backgroundColor: tokens.color.border.subtle,
	},
	insightBottom: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
		gap: spacing.xs,
	},
	chipRow: {
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
});

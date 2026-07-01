import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Pip } from "../../components/common/Pip";
import { SectionCard } from "../../components/common/UI";
import { palette, spacing, tokens, type, type PipState } from "../../theme";

type GutScoreHomeCardProps = {
	score: number;
	trendDelta7d?: number;
	onInfoPress: () => void;
};

type GutScoreZone = "low" | "medium" | "high";

export function GutScoreHomeCard({ score, trendDelta7d = 0, onInfoPress }: GutScoreHomeCardProps) {
	const zone = getGutScoreZone(score);
	const scoreColor = getGutScoreZoneColor(zone);

	return (
		<SectionCard style={styles.card}>
			<View style={styles.copyColumn}>
				<View style={styles.headerRow}>
					<Text style={styles.title}>Gut Score</Text>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="What your Gut Score means"
						hitSlop={10}
						onPress={onInfoPress}
						style={({ pressed }) => [styles.infoBadge, pressed && { opacity: 0.78 }]}
					>
						<Ionicons
							name="information-circle-outline"
							size={19}
							color={tokens.color.icon.accent}
						/>
					</Pressable>
				</View>

				<View style={styles.scoreRow}>
					<Text style={[styles.scoreValue, { color: scoreColor }]}>{score}</Text>
					<Text style={styles.scoreScale}>/100</Text>
				</View>
				<Text style={styles.explainerText}>Higher score = calmer gut</Text>

				<GutScoreTrendCard delta={trendDelta7d} />
			</View>

			<GutScoreVisual score={score} zone={zone} />
		</SectionCard>
	);
}

function GutScoreTrendCard({ delta }: { delta: number }) {
	const trend = getGutScoreTrend(delta);

	return (
		<View style={styles.trendRow}>
			<Ionicons name={trend.iconName} size={14} color={trend.color} />
			<Text style={[styles.trendMetric, { color: trend.color }]}>{trend.metricText}</Text>
			<Text style={styles.trendContext}>this week</Text>
		</View>
	);
}

function GutScoreVisual({ score, zone }: { score: number; zone: GutScoreZone }) {
	return (
		<View
			style={styles.visualWrap}
			accessible
			accessibilityLabel={`Gut Score ${score}, ${zone} range`}
		>
			<SegmentedGutScoreArc activeZone={zone} />
			<Pip state={getPipStateForScore(score)} size={94} style={styles.pipMascot} />
		</View>
	);
}

function SegmentedGutScoreArc({ activeZone }: { activeZone: GutScoreZone }) {
	const segments: { zone: GutScoreZone; start: number; end: number; color: string }[] = [
		{ zone: "low", start: -132, end: -52, color: tokens.color.status.risk.high.tint },
		{ zone: "medium", start: -40, end: 40, color: tokens.color.status.risk.medium.tint },
		{ zone: "high", start: 52, end: 132, color: tokens.color.status.risk.low.tint },
	];

	return (
		<Svg width={132} height={120} viewBox="0 0 162 148" style={styles.arcSvg}>
			{segments.map((segment) => (
				<Path
					key={segment.zone}
					d={describeArc(81, 96, 63, segment.start, segment.end)}
					fill="none"
					stroke={segment.color}
					strokeWidth={14}
					strokeLinecap="round"
					opacity={segment.zone === activeZone ? 1 : 0.24}
				/>
			))}
		</Svg>
	);
}

function getGutScoreZone(score: number): GutScoreZone {
	if (score <= 33) return "low";
	if (score <= 66) return "medium";
	return "high";
}

// Text-grade zone colors: the darker `foreground` tones keep the numeral
// readable on cream (the mid-zone amber tint was the card's weakest contrast).
// The arc keeps the brighter tints — fills and text are different jobs.
function getGutScoreZoneColor(zone: GutScoreZone) {
	if (zone === "low") return tokens.color.status.risk.high.foreground;
	if (zone === "medium") return tokens.color.status.risk.medium.foreground;
	return tokens.color.status.risk.low.foreground;
}

function getPipStateForScore(score: number): PipState {
	const zone = getGutScoreZone(score);
	if (zone === "low") return "anxious";
	if (zone === "medium") return "base";
	return "joy";
}

function getGutScoreTrend(delta: number) {
	if (delta < 0) {
		const magnitude = Math.abs(delta);
		return {
			iconName: "trending-down-outline" as const,
			color: tokens.color.status.risk.high.tint,
			metricText: `-${magnitude} ${magnitude === 1 ? "pt" : "pts"}`,
		};
	}

	if (delta > 0) {
		return {
			iconName: "trending-up-outline" as const,
			color: palette.primary,
			metricText: `+${delta} ${delta === 1 ? "pt" : "pts"}`,
		};
	}

	return {
		iconName: "remove-outline" as const,
		color: palette.textMuted,
		metricText: "Steady",
	};
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
	const start = polarToCartesian(cx, cy, radius, endAngle);
	const end = polarToCartesian(cx, cy, radius, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

	return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

	return {
		x: cx + radius * Math.cos(angleInRadians),
		y: cy + radius * Math.sin(angleInRadians),
	};
}

const styles = StyleSheet.create({
	card: {
		minHeight: 168,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		paddingVertical: spacing.md,
	},
	copyColumn: {
		flex: 1,
		minWidth: 0,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		alignSelf: "flex-start",
		gap: spacing.xs,
		marginBottom: spacing.xs,
	},
	title: {
		...tokens.type.title.block,
		color: tokens.color.text.primary,
	},
	infoBadge: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
		marginTop: -2,
	},
	scoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
	},
	scoreValue: {
		...tokens.type.display.metric,
	},
	scoreScale: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 18,
		lineHeight: 24,
		paddingBottom: 4,
		marginLeft: 4,
	},
	explainerText: {
		maxWidth: 160,
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
		marginTop: 2,
	},
	trendRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: spacing.xs,
	},
	trendMetric: {
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	trendContext: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	visualWrap: {
		width: 132,
		height: 142,
		alignItems: "center",
		justifyContent: "flex-end",
	},
	arcSvg: {
		position: "absolute",
		top: 0,
		left: 0,
		width: 132,
		height: 120,
	},
	pipMascot: {
		marginBottom: 0,
	},
});

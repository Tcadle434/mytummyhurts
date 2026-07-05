import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SectionCard } from "../../components/common/UI";
import { GutScoreVisual, getGutScoreZone } from "../../components/score/GutScoreVisual";
import { spacing, tokens, type } from "../../theme";

type GutScoreHomeCardProps = {
	score: number;
	trendDelta7d?: number;
	onInfoPress: () => void;
};

export function GutScoreHomeCard({ score, trendDelta7d = 0, onInfoPress }: GutScoreHomeCardProps) {
	// The numeral wears the zone tint (the triple-encode: number + arc
	// segment + Pip's face agree) — the original treatment.
	const scoreColor = getGutScoreZoneTint(score);

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

			<GutScoreVisual score={score} />
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
			color: tokens.color.accent.brand,
			metricText: `+${delta} ${delta === 1 ? "pt" : "pts"}`,
		};
	}

	return {
		iconName: "remove-outline" as const,
		color: tokens.color.text.secondary,
		metricText: "Steady",
	};
}

function getGutScoreZoneTint(score: number) {
	const zone = getGutScoreZone(score);
	if (zone === "low") return tokens.color.status.risk.high.tint;
	if (zone === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

const styles = StyleSheet.create({
	card: {
		minHeight: 168,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		paddingVertical: spacing.md,
		backgroundColor: tokens.color.surface.hero.background,
		...tokens.shadow.lift,
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
		color: tokens.color.surface.hero.onHero,
	},
	infoBadge: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: tokens.color.surface.hero.raised,
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
		color: tokens.color.surface.hero.onHeroMuted,
		fontFamily: type.body.semibold,
		fontSize: 18,
		lineHeight: 24,
		paddingBottom: 4,
		marginLeft: 4,
	},
	explainerText: {
		maxWidth: 160,
		color: tokens.color.surface.hero.onHeroMuted,
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
		color: tokens.color.surface.hero.onHeroFaint,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
});

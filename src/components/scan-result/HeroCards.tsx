import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type RiskLevel } from "./common";
import { resultCardStyle } from "./styles";
import { HeroMetric } from "../common/UI";
import { palette, spacing, tokens, type } from "../../theme";
import { RiskBar } from "../charts/RiskBar";

const HERO_IMAGE_HEIGHT = 176;

function toneForLevel(level: RiskLevel) {
	return tokens.color.status.risk[level];
}

// The scan payoff, verdict-first: the meal photo as a real image moment, the
// level word on its tone pill, the verdict sentence in Bricolage, and the
// chunky score numeral in the tone's text-grade foreground. Identity (dish
// name, timestamp) lives in the screen header — this card carries only the
// judgment. Menu results omit the score and lead with the ranking verdict.
export function ScanHeroCard({
	verdict,
	image,
	score,
	level,
	levelLabelOverride,
	conditionRows,
}: {
	verdict: string;
	image?: ReactNode;
	score?: number;
	level?: RiskLevel;
	levelLabelOverride?: string;
	conditionRows?: { name: string; score: number; level: RiskLevel }[];
}) {
	const showScore = typeof score === "number" && Boolean(level);
	const tone = level ? toneForLevel(level) : undefined;
	const levelLabel = level
		? levelLabelOverride ?? `${level.charAt(0).toUpperCase()}${level.slice(1)} risk`
		: undefined;

	return (
		<View style={[resultCardStyle, styles.heroCard]}>
			{image ? <View style={styles.heroImageSlot}>{image}</View> : null}
			<View style={styles.heroBody}>
				{tone && levelLabel ? (
					<View style={[styles.levelPill, { backgroundColor: tone.background }]}>
						<View style={[styles.levelPillDot, { backgroundColor: tone.tint }]} />
						<Text style={[styles.levelPillLabel, { color: tone.foreground }]}>{levelLabel}</Text>
					</View>
				) : null}
				<Text style={styles.heroVerdict}>{verdict}</Text>
				{showScore ? (
					<HeroMetric
						value={score!}
						unit="/100"
						caption="Lower is easier on your gut"
						color={tone!.foreground}
					/>
				) : null}
				{conditionRows && conditionRows.length > 0 ? (
					<>
						<View style={styles.heroDivider} />
						<View style={styles.heroConditionRows}>
							{conditionRows.map((row) => (
								<RiskBar key={row.name} label={row.name} score={row.score} level={row.level} />
							))}
						</View>
					</>
				) : null}
			</View>
		</View>
	);
}

export function RiskHeroCard({
	eyebrow,
	title,
	score,
	level,
	levelLabelOverride,
	cautionNote,
}: {
	eyebrow: string;
	title?: string;
	score: number;
	level: RiskLevel;
	levelLabelOverride?: string;
	cautionNote?: string;
}) {
	const tone = toneForLevel(level);
	const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
	const clampedScore = Math.max(0, Math.min(100, score));
	return (
		<View style={[resultCardStyle, styles.riskHeroCard]}>
			<Text style={styles.kicker}>{eyebrow}</Text>
			{title ? <Text style={styles.riskTitle}>{title}</Text> : null}
			<View style={styles.heroScoreRow}>
				{/* Score and level word are text — text-grade foreground; the tint
				    stays on the meter fill. */}
				<Text style={[styles.heroScore, { color: tone.foreground }]}>{score}</Text>
				<View style={styles.heroScoreTrailing}>
					<Text style={styles.heroScale}>/ 100</Text>
					<Text style={[styles.heroLevelWord, { color: tone.foreground }]}>
						{levelLabelOverride ?? `${levelLabel} risk`}
					</Text>
				</View>
			</View>
			<View style={styles.meterTrack}>
				<View
					style={[
						styles.meterFill,
						{ width: `${clampedScore}%`, backgroundColor: tone.tint },
					]}
				/>
				<View
					style={[styles.meterMarker, { left: `${clampedScore}%`, borderColor: tone.tint }]}
				/>
			</View>
			<View style={styles.meterScale}>
				<Text style={styles.meterScaleLabel}>Low</Text>
				<Text style={styles.meterScaleLabel}>Medium</Text>
				<Text style={styles.meterScaleLabel}>High</Text>
			</View>
			{cautionNote ? <Text style={styles.cautionNote}>{cautionNote}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	heroCard: {
		padding: 0,
		gap: 0,
		overflow: "hidden",
	},
	heroImageSlot: {
		width: "100%",
		height: HERO_IMAGE_HEIGHT,
	},
	heroBody: {
		padding: spacing.lg,
		gap: spacing.md,
	},
	levelPill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingVertical: tokens.space.xxs,
		borderRadius: tokens.radius.pill,
	},
	levelPillDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	levelPillLabel: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
	},
	heroVerdict: {
		...tokens.type.display.section,
		color: tokens.color.text.primary,
	},
	heroDivider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
	},
	heroConditionRows: {
		gap: spacing.sm,
	},
	riskHeroCard: {
		gap: spacing.xs,
	},
	kicker: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	riskTitle: {
		...tokens.type.title.card,
		color: palette.text,
	},
	heroScoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	// Score numerals are Bricolage — the display metric face, not the body ramp.
	heroScore: {
		...tokens.type.display.metric,
	},
	heroScoreTrailing: {
		flex: 1,
		gap: 2,
	},
	heroScale: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 18,
	},
	heroLevelWord: {
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 22,
	},
	meterTrack: {
		marginTop: spacing.sm,
		height: 10,
		borderRadius: 999,
		backgroundColor: tokens.color.chart.track,
		overflow: "visible",
		position: "relative",
	},
	meterFill: {
		height: "100%",
		borderRadius: 999,
	},
	meterMarker: {
		position: "absolute",
		top: -3,
		width: 16,
		height: 16,
		borderRadius: 8,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 3,
		marginLeft: -8,
		...tokens.shadow.card,
	},
	meterScale: {
		marginTop: spacing.xs,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	meterScaleLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	cautionNote: {
		color: tokens.color.status.risk.medium.foreground,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 17,
	},
});

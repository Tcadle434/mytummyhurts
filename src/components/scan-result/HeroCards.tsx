import { ReactNode } from "react";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";

import { colorForLevel, type RiskLevel } from "./common";
import { palette, spacing, tokens, type } from "../../theme";

function ScoreArc({ score, level }: { score: number; level: RiskLevel }) {
	const size = 104;
	const strokeWidth = 9;
	const radius = (size - strokeWidth) / 2;
	const center = size / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.max(0, Math.min(100, score));
	const dashOffset = circumference - (circumference * clamped) / 100;
	const tone = colorForLevel(level);

	return (
		<View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
			<Svg width={size} height={size}>
				<Circle cx={center} cy={center} r={radius} stroke={tokens.color.chart.track} strokeWidth={strokeWidth} fill="transparent" />
				<Circle
					cx={center}
					cy={center}
					r={radius}
					stroke={tone}
					strokeWidth={strokeWidth}
					strokeDasharray={`${circumference} ${circumference}`}
					strokeDashoffset={dashOffset}
					strokeLinecap="round"
					fill="transparent"
					rotation={-90}
					origin={`${center}, ${center}`}
				/>
			</Svg>
			<View style={styles.scoreArcCenter}>
				<Text style={[styles.scoreArcValue, { color: tone }]}>{score}</Text>
				<Text style={styles.scoreArcScale}>/100</Text>
			</View>
		</View>
	);
}

export type HeroConditionChip = { name: string; level: RiskLevel };

// Consolidated result hero shared by food, grocery, and menu results: photo +
// identity up top, decision block below. Menu results omit the arc and lead
// with a ranking verdict instead.
export function ScanHeroCard({
	title,
	meta,
	image,
	score,
	level,
	verdict,
	conditionChips,
}: {
	title: string;
	meta?: string;
	image?: ReactNode;
	score?: number;
	level?: RiskLevel;
	verdict?: string;
	conditionChips?: HeroConditionChip[];
}) {
	const showArc = typeof score === "number" && Boolean(level);
	const levelLabel = level ? `${level.charAt(0).toUpperCase()}${level.slice(1)} risk` : null;

	return (
		<View style={styles.resultCard}>
			<View style={styles.heroIdentityRow}>
				{image ? <View style={styles.heroImageSlot}>{image}</View> : null}
				<View style={styles.heroIdentityCopy}>
					<Text style={styles.heroCardTitle} numberOfLines={3}>
						{title}
					</Text>
					{meta ? <Text style={styles.heroCardMeta}>{meta}</Text> : null}
				</View>
			</View>

			{showArc || verdict ? <View style={styles.heroDivider} /> : null}

			{showArc ? (
				<View style={styles.heroScoreBlock}>
					<ScoreArc score={score!} level={level!} />
					<View style={styles.heroVerdictCopy}>
						<View style={styles.heroLevelRow}>
							<View style={[styles.heroLevelDot, { backgroundColor: colorForLevel(level!) }]} />
							<Text style={[styles.heroLevelText, { color: colorForLevel(level!) }]}>{levelLabel}</Text>
						</View>
						{verdict ? <Text style={styles.heroVerdict}>{verdict}</Text> : null}
					</View>
				</View>
			) : verdict ? (
				<Text style={styles.heroVerdict}>{verdict}</Text>
			) : null}

			{conditionChips && conditionChips.length > 0 ? (
				<View style={styles.heroChipRow}>
					{conditionChips.map((chip) => {
						const tone =
							chip.level === "high"
								? tokens.color.status.risk.high
								: chip.level === "medium"
									? tokens.color.status.risk.medium
									: tokens.color.status.risk.low;
						return (
							<View key={chip.name} style={[styles.heroConditionChip, { backgroundColor: tone.background }]}>
								<Text style={[styles.heroConditionChipName, { color: tone.foreground }]} numberOfLines={1}>
									{chip.name}
								</Text>
								<Text style={[styles.heroConditionChipLevel, { color: tone.foreground }]}>
									{chip.level.charAt(0).toUpperCase() + chip.level.slice(1)}
								</Text>
							</View>
						);
					})}
				</View>
			) : null}
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
	const color = colorForLevel(level);
	const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
	const clampedScore = Math.max(0, Math.min(100, score));
	return (
		<View style={styles.riskHeroCard}>
			<Text style={styles.kicker}>{eyebrow}</Text>
			{title ? <Text style={styles.riskTitle}>{title}</Text> : null}
			<View style={styles.heroScoreRow}>
				<Text style={[styles.heroScore, { color }]}>{score}</Text>
				<View style={styles.heroScoreTrailing}>
					<Text style={styles.heroScale}>/ 100</Text>
					<Text style={[styles.heroLevelWord, { color }]}>
						{levelLabelOverride ?? `${levelLabel} risk`}
					</Text>
				</View>
			</View>
			<View style={styles.meterTrack}>
				<View
					style={[
						styles.meterFill,
						{ width: `${clampedScore}%`, backgroundColor: color },
					]}
				/>
				<View
					style={[styles.meterMarker, { left: `${clampedScore}%`, borderColor: color }]}
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
	scoreArcCenter: {
		position: "absolute",
		alignItems: "center",
	},
	scoreArcValue: {
		fontFamily: type.body.bold,
		fontSize: 27,
		lineHeight: 31,
	},
	scoreArcScale: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 10,
		lineHeight: 13,
	},
	resultCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	heroIdentityRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	heroImageSlot: {
		width: 64,
		height: 64,
		borderRadius: 18,
		overflow: "hidden",
	},
	heroIdentityCopy: {
		flex: 1,
		gap: 3,
	},
	heroCardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.3,
	},
	heroCardMeta: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	heroDivider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
	},
	heroScoreBlock: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	heroVerdictCopy: {
		flex: 1,
		gap: 4,
	},
	heroLevelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	heroLevelDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	heroLevelText: {
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	heroVerdict: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 16,
		lineHeight: 22,
	},
	heroChipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	heroConditionChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
		maxWidth: "100%",
	},
	heroConditionChipName: {
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		flexShrink: 1,
	},
	heroConditionChipLevel: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	riskHeroCard: {
		width: "100%",
		borderRadius: 28,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.xs,
		...tokens.shadow.card,
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
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 28,
	},
	heroScoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	heroScore: {
		fontFamily: type.body.bold,
		fontSize: 56,
		lineHeight: 60,
		letterSpacing: -1.5,
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

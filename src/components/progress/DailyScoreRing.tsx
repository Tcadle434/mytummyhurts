import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { tokens, type } from "../../theme";
import { gutScoreTint } from "../../utils/risk";
import { dailyScoreZoneColor } from "../../utils/weeklyProgress";

type DailyScoreRingVariant = "card" | "hero";

type DailyScoreRingProps = {
	score?: number;
	size?: number;
	strokeWidth?: number;
	/** `hero` renders the ring for the warm hero surface: on-hero numeral
	 * and a raised-on-hero track. Default `card` keeps text-grade band colors
	 * for white and cream surfaces. */
	variant?: DailyScoreRingVariant;
};

const METRIC_TYPE = tokens.type.display.metric;
// Bricolage Grotesque runs wide at heavy weights, so the numeral stays
// conservative relative to the ring diameter ("100%" must clear the stroke).
const SCORE_SIZE_RATIO = 0.36;
// Line height scales with the display.metric token's own ratio so the
// numeral never clips inside its fixed-size ring.
const METRIC_LINE_HEIGHT_RATIO = METRIC_TYPE.lineHeight / METRIC_TYPE.fontSize;
const UNIT_SIZE_RATIO = 0.44;
const MIN_UNIT_FONT_SIZE = 10;

/**
 * The exclusive marker for Daily Score (0-100, higher = calmer). The numeral
 * is Bricolage — the app's voice for anything it has concluded — in the
 * darker text-grade band color; the ring fill keeps the brighter tint.
 */
export function DailyScoreRing({
	score,
	size = 92,
	strokeWidth,
	variant = "card",
}: DailyScoreRingProps) {
	const isHero = variant === "hero";
	const stroke = strokeWidth ?? Math.max(8, Math.round(size * 0.08));
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const hasScore = score !== undefined;
	const clampedScore = Math.max(0, Math.min(100, score ?? 0));
	const progressOffset = circumference * (1 - clampedScore / 100);
	const trackColor = isHero ? tokens.color.surface.hero.raised : tokens.color.chart.track;
	const trackOpacity = isHero ? 1 : hasScore ? 0.58 : 0.78;
	const ringColor = hasScore ? scoreTint(clampedScore) : trackColor;
	const numeralColor = isHero
		? hasScore
			? tokens.color.surface.hero.onHero
			: tokens.color.surface.hero.onHeroFaint
		: hasScore
			? scoreForeground(clampedScore)
			: tokens.color.text.tertiary;
	const scoreFontSize = Math.round(size * SCORE_SIZE_RATIO);
	const scoreLineHeight = Math.round(scoreFontSize * METRIC_LINE_HEIGHT_RATIO);
	const unitFontSize = Math.max(MIN_UNIT_FONT_SIZE, Math.round(scoreFontSize * UNIT_SIZE_RATIO));
	const unitLineHeight = scoreLineHeight;

	return (
		<View
			style={[styles.wrap, { width: size, height: size }]}
			accessible
			accessibilityLabel={hasScore ? `Daily Score ${score} percent` : "Daily Score pending"}
		>
			<Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke={trackColor}
					strokeWidth={stroke}
					fill="none"
					opacity={trackOpacity}
				/>
				{hasScore ? (
					<Circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						stroke={ringColor}
						strokeWidth={stroke}
						fill="none"
						strokeLinecap="round"
						strokeDasharray={`${circumference} ${circumference}`}
						strokeDashoffset={progressOffset}
						rotation="-90"
						origin={`${size / 2}, ${size / 2}`}
					/>
				) : null}
			</Svg>
			<View style={styles.center} pointerEvents="none">
				<Text
					style={[
						styles.score,
						{
							color: numeralColor,
							fontSize: scoreFontSize,
							lineHeight: scoreLineHeight,
							letterSpacing: scaledMetricLetterSpacing(scoreFontSize),
						},
					]}
				>
					{hasScore ? score : "—"}
					{hasScore ? (
						<Text
							style={[
								styles.unit,
								{
									color: numeralColor,
									fontSize: unitFontSize,
									lineHeight: unitLineHeight,
								},
							]}
						>
							%
						</Text>
					) : null}
				</Text>
			</View>
		</View>
	);
}

export function scoreTint(score: number) {
	return gutScoreTint(score);
}

/**
 * Text-grade band color for Daily Score copy: the darker `foreground` tones
 * stay readable on cream and white, where the brighter tints do not.
 */
export function scoreForeground(score: number) {
	return tokens.color.status.risk[dailyScoreZoneColor(score)].foreground;
}

function scaledMetricLetterSpacing(fontSize: number) {
	const baseLetterSpacing = METRIC_TYPE.letterSpacing ?? 0;
	return (baseLetterSpacing * fontSize) / METRIC_TYPE.fontSize;
}

const styles = StyleSheet.create({
	wrap: {
		alignItems: "center",
		justifyContent: "center",
	},
	center: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	score: {
		fontFamily: METRIC_TYPE.fontFamily,
		textAlign: "center",
	},
	unit: {
		fontFamily: type.body.semibold,
		letterSpacing: -0.4,
	},
});

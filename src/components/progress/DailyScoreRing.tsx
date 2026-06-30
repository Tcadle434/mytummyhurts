import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { tokens, type } from "../../theme";
import { gutScoreTint } from "../../utils/risk";

type DailyScoreRingProps = {
	score?: number;
	size?: number;
	strokeWidth?: number;
};

export function DailyScoreRing({ score, size = 92, strokeWidth }: DailyScoreRingProps) {
	const stroke = strokeWidth ?? Math.max(8, Math.round(size * 0.08));
	const radius = (size - stroke) / 2;
	const circumference = 2 * Math.PI * radius;
	const hasScore = score !== undefined;
	const clampedScore = Math.max(0, Math.min(100, score ?? 0));
	const progressOffset = circumference * (1 - clampedScore / 100);
	const ringColor = hasScore ? scoreTint(clampedScore) : tokens.color.chart.track;
	const scoreFontSize = Math.round(size * 0.34);
	const unitFontSize = Math.max(10, Math.round(scoreFontSize * 0.48));
	const unitLineHeight = Math.round(scoreFontSize * 1.05);

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
					stroke={tokens.color.chart.track}
					strokeWidth={stroke}
					fill="none"
					opacity={hasScore ? 0.58 : 0.78}
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
							color: hasScore ? ringColor : tokens.color.text.tertiary,
							fontSize: scoreFontSize,
							lineHeight: Math.round(scoreFontSize * 1.05),
						},
					]}
				>
					{hasScore ? score : "—"}
					{hasScore ? (
						<Text
							style={[
								styles.unit,
								{
									color: ringColor,
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
		fontFamily: type.body.bold,
		fontVariant: ["tabular-nums"],
		letterSpacing: -0.6,
		textAlign: "center",
	},
	unit: {
		fontFamily: type.body.bold,
		letterSpacing: -0.4,
	},
});

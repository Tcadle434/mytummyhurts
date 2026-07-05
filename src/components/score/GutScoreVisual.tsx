import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Pip } from "../common/Pip";
import { tokens, type PipState } from "../../theme";

export type GutScoreZone = "low" | "medium" | "high";

export function getGutScoreZone(score: number): GutScoreZone {
	if (score <= 33) return "low";
	if (score <= 66) return "medium";
	return "high";
}

export function getPipStateForScore(score: number): PipState {
	const zone = getGutScoreZone(score);
	if (zone === "low") return "anxious";
	if (zone === "medium") return "base";
	return "joy";
}

/**
 * The Gut Score's visual identity: the three-zone arc over Pip, whose face
 * matches the score (the triple-encode: number + arc segment + face). Shared
 * by every surface that shows a Gut Score on a hero block.
 */
export function GutScoreVisual({ score }: { score: number }) {
	const zone = getGutScoreZone(score);

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

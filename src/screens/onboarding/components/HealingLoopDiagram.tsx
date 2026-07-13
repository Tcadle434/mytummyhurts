import type { ReactNode } from "react";
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { palette, spacing, tokens, type } from "../../../theme";

const SCAN_FOOD_ILLUSTRATION = require("../../../../assets/ui/scan_food_illustration.png");
const RISK_SCORE_ILLUSTRATION = require("../../../../assets/ui/risk_score_illustration.png");
const LOG_SYMPTOMS_ILLUSTRATION = require("../../../../assets/ui/log_symptoms_illustration.png");

type HealingLoopStep = {
	step: string;
	title: string;
	body: string;
	imageSource?: ImageSourcePropType;
	renderVisual?: () => ReactNode;
};

const HEALING_LOOP_STEPS: HealingLoopStep[] = [
	{
		step: "1",
		title: "Scan food",
		body: "Take a picture. AI deciphers ingredients",
		imageSource: SCAN_FOOD_ILLUSTRATION,
	},
	{
		step: "2",
		title: "Log how you felt",
		body: "Report symptoms once a day.",
		imageSource: LOG_SYMPTOMS_ILLUSTRATION,
	},
	{
		step: "3",
		title: "Learn personalized risk",
		body: "AI learns sensitivity patterns over time and teaches you food risks.",
		imageSource: RISK_SCORE_ILLUSTRATION,
	},
	{
		step: "4",
		title: "Scores improve",
		body: "Gut Score improves as you adapt to findings.",
		renderVisual: () => <HealingScoreMiniChart />,
	},
];

export function HealingLoopDiagram() {
	return (
		<View style={styles.wrap}>
			<Svg
				width={54}
				height={344}
				viewBox="0 0 54 344"
				style={styles.connector}
				pointerEvents="none"
			>
				<Path
					d="M27 35 C4 74 5 102 27 132 C49 163 49 192 27 223 C5 253 5 284 27 316"
					stroke={tokens.color.border.strong}
					strokeWidth={1.25}
					strokeLinecap="round"
					strokeDasharray="4 7"
					fill="none"
					opacity={0.45}
				/>
			</Svg>
			{HEALING_LOOP_STEPS.map((step) => (
				<HealingLoopStepCard key={step.step} {...step} />
			))}
		</View>
	);
}

function HealingLoopStepCard({
	step,
	title,
	body,
	imageSource,
	renderVisual,
}: HealingLoopStep) {
	return (
		<View style={styles.row}>
			<View style={styles.badge}>
				<Text style={styles.badgeText}>{step}</Text>
			</View>
			<View style={styles.card}>
				<View style={styles.visualSlot}>
					{imageSource ? (
						<Image
							source={imageSource}
							style={styles.image}
							resizeMode="contain"
							accessibilityIgnoresInvertColors
						/>
					) : (
						renderVisual?.()
					)}
				</View>
				<View style={styles.copy}>
					<Text style={styles.title}>{title}</Text>
					<Text style={styles.body}>{body}</Text>
				</View>
			</View>
		</View>
	);
}

function HealingScoreMiniChart() {
	return (
		<View style={styles.scoreVisual}>
			<View style={styles.scoreRing}>
				<Svg width={56} height={56} viewBox="0 0 56 56">
					<Circle
						cx={28}
						cy={28}
						r={22}
						stroke={tokens.color.chart.track}
						strokeWidth={6}
						fill="none"
					/>
					<Circle
						cx={28}
						cy={28}
						r={22}
						stroke={tokens.color.status.risk.low.tint}
						strokeWidth={6}
						fill="none"
						strokeLinecap="round"
						strokeDasharray={`${2 * Math.PI * 22} ${2 * Math.PI * 22}`}
						strokeDashoffset={2 * Math.PI * 22 * 0.18}
						rotation="-90"
						origin="28, 28"
					/>
				</Svg>
				<View style={styles.scoreRingCenter}>
					<Text style={styles.scoreValue}>82</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.sm,
		position: "relative",
	},
	connector: {
		position: "absolute",
		left: 1,
		top: 20,
		zIndex: 0,
	},
	row: {
		minHeight: 78,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		zIndex: 1,
	},
	badge: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: palette.primary,
	},
	badgeText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	card: {
		flex: 1,
		minHeight: 78,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	visualSlot: {
		width: 64,
		height: 64,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	image: {
		width: 82,
		height: 82,
	},
	copy: {
		flex: 1,
		gap: 3,
	},
	title: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	body: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	scoreVisual: {
		width: 66,
		height: 66,
		alignItems: "center",
		justifyContent: "center",
	},
	scoreRing: {
		width: 56,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
	},
	scoreRingCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	scoreValue: {
		color: tokens.color.status.risk.low.foreground,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 18,
		fontVariant: ["tabular-nums"],
	},
});

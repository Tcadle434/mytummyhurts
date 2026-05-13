import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Image, ImageSourcePropType, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { GutScoreInfoCards } from "../../../components/gut-score/GutScoreInfoCards";
import { WeeklyProgressCard } from "../../../components/progress/WeeklyProgressCard";
import { palette, spacing, tokens, type } from "../../../theme";
import {
	createMockFeaturedDailyScoreDay,
	createMockWeeklyProgressDays,
} from "../../../utils/weeklyProgress";
import {
	PhaseDiscoveryGraphic,
	type PhaseDiscoveryState,
} from "./PhaseDiscoveryGraphic";
import {
	FoodControlIntroGraphic,
	FoodLeverComparisonGraphic,
} from "./FoodControlGraphics";
import {
	PhaseLimitationGraphic,
	PhaseReintroductionGraphic,
} from "./PhasePlanGraphics";
import { ScannerModesOverviewGraphic } from "./ScannerModesOverviewGraphic";

const PIP_ANXIOUS = require("../../../../assets/pip/pip_anxious_transparent.png");
const PIP_JOYOUS = require("../../../../assets/pip/pip_joyous_transparent.png");
const SCAN_FOOD_ILLUSTRATION = require("../../../../assets/ui/scan_food_illustration.png");
const RISK_SCORE_ILLUSTRATION = require("../../../../assets/ui/risk_score_illustration.png");
const LOG_SYMPTOMS_ILLUSTRATION = require("../../../../assets/ui/log_symptoms_illustration.png");
const EATING_OUT_ICON = require("../../../../assets/ui/eating_out_icon.png");
const TRAVELLING_ICON = require("../../../../assets/ui/travelling_icon.png");
const LEAVING_HOUSE_ICON = require("../../../../assets/ui/leaving_house_icon.png");
const HEALTH_ANXIETY_ICON = require("../../../../assets/ui/health_anxiety_icon.png");
const CONFIDENCE_BACK_ICON = require("../../../../assets/ui/confidence_back_icon.png");
const HEALTH_BACK_ICON = require("../../../../assets/ui/health_back_icon.png");
const LIFE_BACK_ICON = require("../../../../assets/ui/life_back_icon.png");

type OnboardingCenterGraphicProps = {
	centerGraphic?: string;
	phaseDiscoveryState?: PhaseDiscoveryState;
};

/**
 * Routes onboarding `centerGraphic` keys to focused graphic components. This
 * keeps the screen controller from owning illustration composition.
 */
export function OnboardingCenterGraphic({
	centerGraphic,
	phaseDiscoveryState = "scan",
}: OnboardingCenterGraphicProps) {
	switch (centerGraphic) {
		case "empathyProblem":
			return <EmpathyProblemGraphic />;
		case "healingPromise":
			return <HealingPromiseGraphic />;
		case "gutScoreScale":
			return <GutScoreScaleGraphic />;
		case "dailyScoreCard": {
			const mockDays = createMockWeeklyProgressDays();
			return (
				<WeeklyProgressCard
					days={mockDays}
					mode="preview"
					showChevron={false}
					featuredDay={createMockFeaturedDailyScoreDay()}
					featuredLabel="Yesterday"
				/>
			);
		}
		case "healingLoopDiagram":
			return <HealingLoopDiagram />;
		case "phaseDiscovery":
			return <PhaseDiscoveryGraphic state={phaseDiscoveryState} />;
		case "phaseLimitation":
			return <PhaseLimitationGraphic />;
		case "phaseReintroduction":
			return <PhaseReintroductionGraphic />;
		case "scannerModesOverview":
			return <ScannerModesOverviewGraphic />;
		case "foodControlIntro":
			return <FoodControlIntroGraphic />;
		case "foodLeverComparison":
			return <FoodLeverComparisonGraphic />;
		default:
			return null;
	}
}

function GutScoreScaleGraphic() {
	return (
		<View style={styles.educationCard}>
			<View style={styles.educationScoreHeader}>
				<View>
					<Text style={styles.educationEyebrow}>Gut Score</Text>
					<Text style={styles.educationCardTitle}>Overall rating</Text>
				</View>
				<Text style={[styles.educationScoreValue, { color: tokens.color.status.risk.medium.tint }]}>
					42
					<Text style={styles.educationScoreScale}>/100</Text>
				</Text>
			</View>
			<View style={styles.gutScoreScaleTrack}>
				<View
					style={[
						styles.gutScoreScaleSegment,
						styles.gutScoreScaleStart,
						{ backgroundColor: tokens.color.status.risk.high.tint },
					]}
				/>
				<View
					style={[
						styles.gutScoreScaleSegment,
						{ backgroundColor: tokens.color.status.risk.medium.tint },
					]}
				/>
				<View
					style={[
						styles.gutScoreScaleSegment,
						styles.gutScoreScaleEnd,
						{ backgroundColor: tokens.color.status.risk.low.tint },
					]}
				/>
			</View>
			<View style={styles.scaleLabelRow}>
				<Text
					style={[
						styles.scaleEndpointLabel,
						{ color: tokens.color.status.risk.high.foreground },
					]}
				>
					Reactive
				</Text>
				<Text
					style={[
						styles.scaleEndpointLabel,
						{ color: tokens.color.status.risk.low.foreground },
					]}
				>
					Calmer
				</Text>
			</View>
			<GutScoreInfoCards />
			<View style={styles.educationSignalRow}>
				<View style={styles.educationIconBadge}>
					<Ionicons name="trending-up" size={18} color={tokens.color.status.risk.low.foreground} />
				</View>
				<Text style={styles.educationSignalText}>
					Higher means your gut looks more stable over time. Raise your score!
				</Text>
			</View>
		</View>
	);
}

function EmpathyProblemGraphic() {
	return (
		<View style={styles.empathyGraphic}>
			<View style={styles.empathySceneCard}>
				<View style={styles.empathyPipHalo} />
				<Image
					source={PIP_ANXIOUS}
					style={styles.empathyPip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling anxious"
				/>
				<EmpathyConcernCard
					imageSource={EATING_OUT_ICON}
					label="Worried to eat out"
					positionStyle={styles.empathyConcernTopLeft}
				/>
				<EmpathyConcernCard
					imageSource={TRAVELLING_ICON}
					label="Nervous to travel"
					positionStyle={styles.empathyConcernTopRight}
				/>
				<EmpathyConcernCard
					imageSource={LEAVING_HOUSE_ICON}
					label="Scared to leave your house"
					positionStyle={styles.empathyConcernBottomLeft}
				/>
				<EmpathyConcernCard
					imageSource={HEALTH_ANXIETY_ICON}
					label="Anxious about your health"
					positionStyle={styles.empathyConcernBottomRight}
				/>
			</View>
		</View>
	);
}

function EmpathyConcernCard({
	imageSource,
	label,
	positionStyle,
}: {
	imageSource: ImageSourcePropType;
	label: string;
	positionStyle: StyleProp<ViewStyle>;
}) {
	return (
		<View style={[styles.empathyConcernCard, positionStyle]}>
			<View style={styles.empathyConcernIconSlot}>
				<Image
					source={imageSource}
					style={styles.empathyConcernIcon}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>
			<Text style={styles.empathyConcernText}>{label}</Text>
		</View>
	);
}

function HealingPromiseGraphic() {
	return (
		<View style={styles.promiseGraphic}>
			<View style={styles.promiseHeroCard}>
				<View style={styles.promiseHeroGlow} />
				<Image
					source={PIP_JOYOUS}
					style={styles.promisePip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling better"
				/>
				<View style={styles.promiseHeroAccent}>
					<Ionicons name="trending-up" size={19} color={tokens.color.icon.accent} />
					<Text style={styles.promiseHeroAccentText}>Small steps. Real progress.</Text>
				</View>
			</View>

			<View style={styles.promiseCardRow}>
				<PromiseOutcomeCard
					imageSource={CONFIDENCE_BACK_ICON}
					title="Confidence"
					body="Feel like yourself again."
				/>
				<PromiseOutcomeCard
					imageSource={HEALTH_BACK_ICON}
					title="Health"
					body="Stronger gut. More energy."
				/>
				<PromiseOutcomeCard
					imageSource={LIFE_BACK_ICON}
					title="Life"
					body="More freedom. More you."
				/>
			</View>
		</View>
	);
}

function PromiseOutcomeCard({
	imageSource,
	title,
	body,
}: {
	imageSource: ImageSourcePropType;
	title: string;
	body: string;
}) {
	return (
		<View style={styles.promiseOutcomeCard}>
			<Image
				source={imageSource}
				style={styles.promiseOutcomeIcon}
				resizeMode="contain"
				accessibilityIgnoresInvertColors
			/>
			<Text style={styles.promiseOutcomeTitle}>{title}</Text>
			<View style={styles.promiseDividerMark} />
			<Text style={styles.promiseOutcomeBody}>{body}</Text>
		</View>
	);
}

function HealingLoopDiagram() {
	const steps = [
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

	return (
		<View style={styles.healingLoopWrap}>
			<Svg
				width={54}
				height={344}
				viewBox="0 0 54 344"
				style={styles.healingLoopConnector}
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
			{steps.map((step) => (
				<HealingLoopStepCard
					key={step.step}
					step={step.step}
					title={step.title}
					body={step.body}
					imageSource={step.imageSource}
					renderVisual={step.renderVisual}
				/>
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
}: {
	step: string;
	title: string;
	body: string;
	imageSource?: ImageSourcePropType;
	renderVisual?: () => ReactNode;
}) {
	return (
		<View style={styles.healingLoopRow}>
			<View style={styles.healingLoopBadge}>
				<Text style={styles.healingLoopBadgeText}>{step}</Text>
			</View>
			<View style={styles.healingLoopCard}>
				<View style={styles.healingLoopVisualSlot}>
					{imageSource ? (
						<Image
							source={imageSource}
							style={styles.healingLoopImage}
							resizeMode="contain"
							accessibilityIgnoresInvertColors
						/>
					) : (
						renderVisual?.()
					)}
				</View>
				<View style={styles.healingLoopCopy}>
					<Text style={styles.healingLoopTitle}>{title}</Text>
					<Text style={styles.healingLoopBody}>{body}</Text>
				</View>
			</View>
		</View>
	);
}

function HealingScoreMiniChart() {
	return (
		<View style={styles.healingScoreVisual}>
			<View style={styles.healingScoreRing}>
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
				<View style={styles.healingScoreRingCenter}>
					<Text style={styles.healingScoreValue}>82</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	educationCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	educationScoreHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	educationEyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	educationCardTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	educationScoreValue: {
		fontFamily: type.body.bold,
		fontSize: 52,
		lineHeight: 58,
		fontVariant: ["tabular-nums"],
	},
	educationScoreScale: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 18,
		lineHeight: 22,
	},
	gutScoreScaleTrack: {
		height: 14,
		flexDirection: "row",
		gap: 3,
	},
	gutScoreScaleSegment: {
		flex: 1,
	},
	gutScoreScaleStart: {
		borderTopLeftRadius: 99,
		borderBottomLeftRadius: 99,
	},
	gutScoreScaleEnd: {
		borderTopRightRadius: 99,
		borderBottomRightRadius: 99,
	},
	scaleLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: -spacing.xs,
	},
	scaleEndpointLabel: {
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
	},
	educationSignalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		padding: spacing.md,
	},
	educationIconBadge: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	educationSignalText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 20,
	},
	empathyGraphic: {
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
	},
	empathySceneCard: {
		width: "100%",
		height: 354,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	empathyPipHalo: {
		position: "absolute",
		left: 86,
		top: 82,
		width: 188,
		height: 188,
		borderRadius: 94,
		backgroundColor: tokens.color.status.success.background,
	},
	empathyPip: {
		position: "absolute",
		left: 89,
		top: 76,
		width: 182,
		height: 182,
		zIndex: 2,
	},
	empathyConcernCard: {
		position: "absolute",
		width: 116,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.frosted,
		alignItems: "center",
		justifyContent: "flex-start",
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: spacing.xs,
		gap: 0,
		...tokens.shadow.card,
		zIndex: 3,
	},
	empathyConcernTopLeft: {
		left: spacing.sm,
		top: spacing.md,
	},
	empathyConcernTopRight: {
		right: spacing.sm,
		top: spacing.md,
	},
	empathyConcernBottomLeft: {
		left: spacing.sm,
		bottom: spacing.md,
	},
	empathyConcernBottomRight: {
		right: spacing.sm,
		bottom: spacing.md,
	},
	empathyConcernIconSlot: {
		width: "100%",
		height: 88,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
	},
	empathyConcernIcon: {
		width: 142,
		height: 142,
	},
	empathyConcernText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
		paddingHorizontal: spacing.xs,
		paddingTop: spacing.xs,
	},
	promiseGraphic: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.md,
	},
	promiseHeroCard: {
		height: 206,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.frosted,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		...tokens.shadow.card,
	},
	promiseHeroGlow: {
		position: "absolute",
		width: 226,
		height: 126,
		borderRadius: 80,
		backgroundColor: tokens.color.status.success.background,
		bottom: 20,
	},
	promisePip: {
		width: 164,
		height: 164,
		marginTop: -spacing.sm,
	},
	promiseHeroAccent: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		bottom: spacing.md,
		minHeight: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.default,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.md,
	},
	promiseHeroAccentText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	promiseCardRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	promiseOutcomeCard: {
		flex: 1,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	promiseOutcomeIcon: {
		width: 72,
		height: 72,
		marginBottom: spacing.xs,
	},
	promiseOutcomeTitle: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 17,
		textAlign: "center",
	},
	promiseDividerMark: {
		width: 26,
		height: 2,
		borderRadius: 2,
		backgroundColor: tokens.color.accent.mascotAccent,
		marginVertical: 5,
	},
	promiseOutcomeBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 10,
		lineHeight: 13,
		textAlign: "center",
	},
	healingLoopWrap: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.sm,
		position: "relative",
	},
	healingLoopConnector: {
		position: "absolute",
		left: 1,
		top: 20,
		zIndex: 0,
	},
	healingLoopRow: {
		minHeight: 78,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		zIndex: 1,
	},
	healingLoopBadge: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: palette.primary,
	},
	healingLoopBadgeText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	healingLoopCard: {
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
	healingLoopVisualSlot: {
		width: 64,
		height: 64,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	healingLoopImage: {
		width: 82,
		height: 82,
	},
	healingLoopCopy: {
		flex: 1,
		gap: 3,
	},
	healingLoopTitle: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	healingLoopBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	healingScoreVisual: {
		width: 66,
		height: 66,
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreRing: {
		width: 56,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreRingCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreValue: {
		color: tokens.color.status.risk.low.foreground,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 18,
		fontVariant: ["tabular-nums"],
	},
});

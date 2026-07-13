import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";
import { withAlpha } from "../../../theme/helpers";
import { riskLevelColors } from "../../../utils/risk";

export { FoodLeverComparisonGraphic } from "./FoodLeverComparisonGraphic";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type RiskEvidenceTone = "low" | "medium" | "high";

const PIP_THINKING = require("../../../../assets/pip/pip_thinking_transparent.png");
const BANANA_ASSET = require("../../../../assets/ui/banana_transparent.png");
const CARROT_ASSET = require("../../../../assets/ui/carrot_transparent.png");
const PLANT_1_ASSET = require("../../../../assets/ui/plant_1_transparent.png");
const PLANT_2_ASSET = require("../../../../assets/ui/plant_2_transparent.png");
const PLANT_3_ASSET = require("../../../../assets/ui/plant_3_transparent.png");
const RICE_ASSET = require("../../../../assets/ui/rice_transparent.png");
const TOAST_ASSET = require("../../../../assets/ui/toast_transparent.png");

/**
 * Food-control onboarding visuals. These screens are presentation-heavy and
 * asset-heavy, so they live outside the flow controller.
 */
export function FoodControlIntroGraphic() {
	return (
		<View style={styles.foodControlIntro}>
			<View style={styles.foodControlHeroCard}>
				<View style={styles.foodControlGlassSheen} />
				<Image
					source={PIP_THINKING}
					style={styles.foodControlPip}
					resizeMode="contain"
					accessibilityLabel="Pip thinking"
				/>
				<Image
					source={RICE_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlRiceAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={BANANA_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlBananaAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={CARROT_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlCarrotAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={TOAST_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlToastAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_1_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantOneAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_2_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantTwoAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_3_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantThreeAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Text style={styles.foodControlWord}>FOOD</Text>
				<View style={styles.foodControlPill}>
					<Text style={styles.foodControlPillText}>The #1 thing you can control</Text>
				</View>
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleOne]} />
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleTwo]} />
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleThree]} />
			</View>

			<View style={styles.foodControlMiniRow}>
				<FoodControlMiniCard
					rank="#1"
					title="Food"
					body="Most impact\nMost control"
					iconName="leaf-outline"
					tone="low"
					featured
				/>
				<FoodControlMiniCard
					title="Sleep"
					body="Some impact\nSome control"
					iconName="moon"
					tone="medium"
				/>
				<FoodControlMiniCard
					title="Stress"
					body="High impact\nLow control"
					iconName="flash-outline"
					tone="high"
				/>
			</View>
		</View>
	);
}

function FoodControlMiniCard({
	rank,
	title,
	body,
	iconName,
	tone,
	featured,
}: {
	rank?: string;
	title: string;
	body: string;
	iconName: IoniconName;
	tone: RiskEvidenceTone;
	featured?: boolean;
}) {
	const toneColors = riskLevelColors(tone);
	const bodyText = body.replace(/\\n/g, "\n");

	return (
		<View style={[styles.foodControlMiniCard, featured ? styles.foodControlMiniCardFeatured : null]}>
			{rank ? (
				<View style={styles.foodControlMiniRank}>
					<Text style={styles.foodControlMiniRankText}>{rank}</Text>
				</View>
			) : null}
			<View style={[styles.foodControlMiniIcon, { backgroundColor: toneColors.background }]}>
				<Ionicons name={iconName} size={28} color={toneColors.foreground} />
			</View>
			<Text style={[styles.foodControlMiniTitle, { color: toneColors.foreground }]}>
				{title}
			</Text>
			<Text style={styles.foodControlMiniBody}>{bodyText}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	foodControlIntro: {
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	foodControlHeroCard: {
		width: "100%",
		height: 248,
		borderRadius: 34,
		borderWidth: 1,
		borderColor: withAlpha(tokens.color.utility.white, 0.74),
		backgroundColor: withAlpha(tokens.color.utility.white, 0.18),
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: tokens.color.utility.shadow,
		shadowOpacity: 0.14,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 12 },
		elevation: 4,
	},
	foodControlGlassSheen: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: withAlpha(tokens.color.utility.white, 0.12),
	},
	foodControlPip: {
		position: "absolute",
		top: 20,
		right: 100,
		width: 104,
		height: 104,
		zIndex: 4,
	},
	foodControlFloatingAsset: {
		position: "absolute",
		zIndex: 4,
	},
	foodControlRiceAsset: {
		left: 48,
		top: 48,
		width: 58,
		height: 58,
		transform: [{ rotate: "-8deg" }],
	},
	foodControlBananaAsset: {
		left: 102,
		top: 98,
		width: 50,
		height: 50,
		transform: [{ rotate: "-12deg" }],
	},
	foodControlCarrotAsset: {
		left: 35,
		bottom: 86,
		width: 52,
		height: 52,
		transform: [{ rotate: "-18deg" }],
	},
	foodControlToastAsset: {
		right: 52,
		top: 94,
		width: 56,
		height: 56,
		transform: [{ rotate: "12deg" }],
	},
	foodControlPlantOneAsset: {
		left: 100,
		top: 22,
		width: 30,
		height: 30,
		transform: [{ rotate: "-20deg" }],
	},
	foodControlPlantTwoAsset: {
		right: 67,
		top: 50,
		width: 31,
		height: 31,
		transform: [{ rotate: "18deg" }],
	},
	foodControlPlantThreeAsset: {
		right: 108,
		bottom: 103,
		width: 30,
		height: 30,
		transform: [{ rotate: "-8deg" }],
	},
	foodControlPill: {
		position: "absolute",
		bottom: 16,
		minHeight: 30,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: withAlpha(tokens.color.utility.white, 0.58),
		backgroundColor: withAlpha(tokens.color.accent.brandStrong, 0.92),
		paddingHorizontal: spacing.lg,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 6,
	},
	foodControlPillText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	foodControlWord: {
		position: "absolute",
		bottom: 36,
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 68,
		lineHeight: 74,
		letterSpacing: 0,
		textShadowColor: withAlpha(tokens.color.utility.shadow, 0.28),
		textShadowOffset: { width: 0, height: 4 },
		textShadowRadius: 8,
		zIndex: 5,
	},
	foodControlSparkle: {
		position: "absolute",
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: withAlpha(tokens.color.utility.white, 0.86),
		zIndex: 2,
	},
	foodControlSparkleOne: {
		left: 72,
		top: 100,
	},
	foodControlSparkleTwo: {
		right: 74,
		top: 142,
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	foodControlSparkleThree: {
		right: 132,
		bottom: 98,
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	foodControlMiniRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "stretch",
		justifyContent: "space-between",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	foodControlMiniCard: {
		flex: 1,
		minHeight: 102,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: withAlpha(tokens.color.utility.white, 0.38),
		backgroundColor: withAlpha(tokens.color.utility.white, 0.42),
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		gap: spacing.xs,
		shadowColor: tokens.color.utility.shadow,
		shadowOpacity: 0.1,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 2,
	},
	foodControlMiniCardFeatured: {
		borderColor: tokens.color.border.emphasis,
		backgroundColor: tokens.color.surface.frosted,
		shadowOpacity: 0.16,
	},
	foodControlMiniRank: {
		position: "absolute",
		top: -13,
		left: -8,
		minWidth: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: withAlpha(tokens.color.utility.white, 0.86),
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 3,
	},
	foodControlMiniRankText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	foodControlMiniIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	foodControlMiniTitle: {
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 18,
		textAlign: "center",
	},
	foodControlMiniBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
	},
});

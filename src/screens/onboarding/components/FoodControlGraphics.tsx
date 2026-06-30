import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";
import { riskLevelColors } from "../../../utils/risk";

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
const MULTI_PURPOSE_FOOD_SCANNER = require("../../../../assets/ui/multi_purpose_food_scanner.png");

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

export function FoodLeverComparisonGraphic() {
	return (
		<View style={styles.foodLeverWrap}>
			<View style={styles.foodLeverHeroCard}>
				<View style={styles.foodLeverHeroContent}>
					<View style={styles.foodLeverRankBadge}>
						<Text style={styles.foodLeverRankText}>1</Text>
					</View>
					<View style={styles.foodLeverHeroCopy}>
						<Text style={styles.foodLeverHeroTitle}>Food</Text>
						<View style={styles.foodLeverImpactRow}>
							<Ionicons name="sparkles" size={15} color={tokens.color.icon.accent} />
							<Text style={styles.foodLeverImpactText}>Biggest impact</Text>
						</View>
						<Text style={styles.foodLeverSubtext}>Most controllable</Text>
					</View>
				</View>

				<View style={styles.foodLeverHeroVisualWrap}>
					<View style={styles.foodLeverChoiceBadge}>
						<Ionicons name="checkmark" size={15} color={tokens.color.text.inverse} />
						<Text style={styles.foodLeverChoiceText}>You choose what you eat</Text>
					</View>
					<View style={styles.foodLeverImageHalo} />
					<Image
						source={MULTI_PURPOSE_FOOD_SCANNER}
						style={styles.foodLeverFoodImage}
						resizeMode="contain"
						accessibilityIgnoresInvertColors
					/>
				</View>

				<View style={styles.foodLeverScaleBlock}>
					<View style={styles.foodLeverScaleTrack}>
						<View style={styles.foodLeverScaleFill} />
					</View>
					<View style={styles.foodLeverScaleLabels}>
						<Text style={styles.foodLeverScaleLabel}>Impact</Text>
						<Text style={styles.foodLeverScaleLabel}>High</Text>
					</View>
				</View>
			</View>

			<FoodLeverSecondaryRow
				rank="2"
				title="Stress"
				body="Also matters"
				label="Moderate impact"
				tone="medium"
				iconName="flash-outline"
			/>
			<FoodLeverSecondaryRow
				rank="3"
				title="Sleep"
				body="Also matters"
				label="Lower impact"
				tone="high"
				iconName="moon"
			/>

			<View style={styles.foodLeverCallout}>
				<View style={styles.foodLeverCalloutIcon}>
					<Ionicons name="heart-outline" size={21} color={tokens.color.icon.accent} />
				</View>
				<Text style={styles.foodLeverCalloutText}>
					We focus on the thing you can change first.
				</Text>
			</View>
		</View>
	);
}

function FoodLeverSecondaryRow({
	rank,
	title,
	body,
	label,
	tone,
	iconName,
}: {
	rank: string;
	title: string;
	body: string;
	label: string;
	tone: "medium" | "high";
	iconName: IoniconName;
}) {
	const toneColors =
		tone === "medium" ? tokens.color.status.risk.medium : tokens.color.status.risk.high;

	return (
		<View style={styles.foodLeverSecondaryCard}>
			<View style={styles.foodLeverSecondaryRank}>
				<Text style={styles.foodLeverSecondaryRankText}>{rank}</Text>
			</View>
			<View style={[styles.foodLeverSecondaryIcon, { backgroundColor: toneColors.background }]}>
				<Ionicons name={iconName} size={28} color={toneColors.foreground} />
			</View>
			<View style={styles.foodLeverSecondaryCopy}>
				<Text style={styles.foodLeverSecondaryTitle}>{title}</Text>
				<Text style={styles.foodLeverSecondaryBody}>{body}</Text>
			</View>
			<View style={styles.foodLeverSecondaryMetric}>
				<View style={styles.foodLeverMiniTrack}>
					<View
						style={[
							styles.foodLeverMiniFill,
							{
								width: tone === "medium" ? "62%" : "32%",
								backgroundColor: toneColors.tint,
							},
						]}
					/>
				</View>
				<Text style={[styles.foodLeverMetricLabel, { color: toneColors.foreground }]}>
					{label}
				</Text>
			</View>
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
		borderColor: "rgba(255,255,255,0.74)",
		backgroundColor: "rgba(255,255,255,0.18)",
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
		backgroundColor: "rgba(255,255,255,0.12)",
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
		borderColor: "rgba(255,255,255,0.58)",
		backgroundColor: "rgba(91,166,135,0.84)",
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
		textShadowColor: "rgba(33,43,50,0.28)",
		textShadowOffset: { width: 0, height: 4 },
		textShadowRadius: 8,
		zIndex: 5,
	},
	foodControlSparkle: {
		position: "absolute",
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "rgba(255,255,255,0.86)",
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
		borderColor: "rgba(255,255,255,0.38)",
		backgroundColor: "rgba(255,255,255,0.42)",
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
		borderColor: "rgba(255,255,255,0.86)",
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
	foodLeverWrap: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.sm,
	},
	foodLeverHeroCard: {
		minHeight: 210,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
		borderRadius: 28,
		backgroundColor: tokens.color.surface.frosted,
		padding: spacing.md,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	foodLeverHeroContent: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		zIndex: 2,
	},
	foodLeverRankBadge: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverRankText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 28,
		lineHeight: 32,
	},
	foodLeverHeroCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	foodLeverHeroTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 30,
		lineHeight: 34,
	},
	foodLeverImpactRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: spacing.xs,
	},
	foodLeverImpactText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	foodLeverSubtext: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 17,
	},
	foodLeverHeroVisualWrap: {
		position: "absolute",
		right: -14,
		bottom: 20,
		width: 166,
		height: 126,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverImageHalo: {
		position: "absolute",
		right: 18,
		bottom: 8,
		width: 104,
		height: 104,
		borderRadius: 52,
		backgroundColor: tokens.color.status.success.background,
	},
	foodLeverFoodImage: {
		width: 170,
		height: 128,
	},
	foodLeverChoiceBadge: {
		position: "absolute",
		right: 12,
		top: -18,
		zIndex: 3,
		maxWidth: 118,
		minHeight: 36,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.xs,
		...tokens.shadow.card,
	},
	foodLeverChoiceText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 13,
	},
	foodLeverScaleBlock: {
		position: "absolute",
		left: spacing.md,
		bottom: spacing.md,
		width: 138,
		gap: spacing.xs,
	},
	foodLeverScaleTrack: {
		height: 10,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	foodLeverScaleFill: {
		width: "78%",
		height: "100%",
		borderRadius: 99,
		backgroundColor: palette.primary,
	},
	foodLeverScaleLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	foodLeverScaleLabel: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
	},
	foodLeverSecondaryCard: {
		minHeight: 68,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		...tokens.shadow.card,
	},
	foodLeverSecondaryRank: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverSecondaryRankText: {
		color: tokens.color.text.warm,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 24,
	},
	foodLeverSecondaryIcon: {
		width: 46,
		height: 46,
		borderRadius: 23,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverSecondaryCopy: {
		flex: 1,
		gap: 2,
	},
	foodLeverSecondaryTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 22,
	},
	foodLeverSecondaryBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 15,
	},
	foodLeverSecondaryMetric: {
		width: 88,
		gap: 4,
	},
	foodLeverMiniTrack: {
		height: 8,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	foodLeverMiniFill: {
		height: "100%",
		borderRadius: 99,
	},
	foodLeverMetricLabel: {
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 13,
	},
	foodLeverCallout: {
		minHeight: 46,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 23,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.md,
	},
	foodLeverCalloutIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverCalloutText: {
		flex: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
});

import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const MULTI_PURPOSE_FOOD_SCANNER = require("../../../../assets/ui/multi_purpose_food_scanner.png");

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

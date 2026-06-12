import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { radii, spacing, tokens, type } from "../../../theme";
import type { FoodCalibrationRating } from "../../../types/domain";

const RATING_OPTIONS: { rating: FoodCalibrationRating; label: string }[] = [
	{ rating: "fine", label: "Fine" },
	{ rating: "unsure", label: "Unsure" },
	{ rating: "bad", label: "Bad" },
];

const RATING_COLORS: Record<FoodCalibrationRating, { background: string; border: string; text: string }> = {
	fine: {
		background: tokens.color.status.risk.low.background,
		border: tokens.color.status.risk.low.tint,
		text: tokens.color.status.risk.low.foreground,
	},
	unsure: {
		background: tokens.color.status.risk.medium.background,
		border: tokens.color.status.risk.medium.tint,
		text: tokens.color.status.risk.medium.foreground,
	},
	bad: {
		background: tokens.color.status.risk.high.background,
		border: tokens.color.status.risk.high.tint,
		text: tokens.color.status.risk.high.foreground,
	},
};

type CalibrationDeckProps = {
	foods: { label: string; emoji: string }[];
	ratings: Record<string, FoodCalibrationRating>;
	onRate: (food: string, rating: FoodCalibrationRating | null) => void;
	baseDelayMs?: number;
	stepDelayMs?: number;
};

export function CalibrationDeck({
	foods,
	ratings,
	onRate,
	baseDelayMs = 80,
	stepDelayMs = 40,
}: CalibrationDeckProps) {
	function handleRatingPress(food: string, rating: FoodCalibrationRating) {
		void Haptics.selectionAsync();
		onRate(food, ratings[food] === rating ? null : rating);
	}

	return (
		<View style={styles.deck}>
			{foods.map((food, index) => {
				const currentRating = ratings[food.label];
				return (
					<Animated.View
						key={food.label}
						entering={FadeInUp.duration(320).delay(baseDelayMs + stepDelayMs * index)}
						style={styles.row}
					>
						<View style={styles.foodCell}>
							<Text style={styles.foodEmoji}>{food.emoji}</Text>
							<Text style={styles.foodLabel} numberOfLines={2}>
								{food.label}
							</Text>
						</View>
						<View style={styles.ratingGroup}>
							{RATING_OPTIONS.map((option) => {
								const selected = currentRating === option.rating;
								const colors = RATING_COLORS[option.rating];
								return (
									<Pressable
										key={option.rating}
										accessibilityRole="button"
										accessibilityState={{ selected }}
										accessibilityLabel={`${food.label}: ${option.label}`}
										onPress={() => handleRatingPress(food.label, option.rating)}
										style={[
											styles.ratingButton,
											selected && {
												backgroundColor: colors.background,
												borderColor: colors.border,
											},
										]}
									>
										<Text
											style={[styles.ratingLabel, selected && { color: colors.text }]}
										>
											{option.label}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</Animated.View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	deck: {
		gap: spacing.sm,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		minHeight: 56,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.md,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		...tokens.shadow.card,
	},
	foodCell: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		flexShrink: 1,
		flexGrow: 1,
	},
	foodEmoji: {
		fontSize: 20,
	},
	foodLabel: {
		flexShrink: 1,
		fontFamily: type.body.semibold,
		fontSize: 15,
		color: tokens.color.text.primary,
	},
	ratingGroup: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	ratingButton: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.app.default,
		minWidth: 58,
		alignItems: "center",
	},
	ratingLabel: {
		fontFamily: type.body.medium,
		fontSize: 13,
		color: tokens.color.text.secondary,
	},
});

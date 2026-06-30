import { StyleSheet, Text, View } from "react-native";

import { colorForDietStatus, colorForLevel, dietStatusLabel, type RiskLevel, type ScanIngredient } from "./common";
import { cardTitleStyle, resultCardStyle } from "./styles";
import { palette, spacing, tokens, type } from "../../theme";
import type { DietEvaluation } from "../../types/domain";

export function IngredientsBreakdownCard({
	title = "Ingredient breakdown",
	ingredients,
}: {
	title?: string;
	ingredients?: ScanIngredient[];
}) {
	// Display-only noise filter: zero-signal additives add scroll, not insight.
	const NOISE_INGREDIENTS = new Set([
		"salt", "water", "vitamin e", "vitamin c", "vitamin d", "citric acid", "niacinamide",
		"sea salt", "natural vitamin e", "mixed tocopherols",
	]);
	const safeIngredients = (ingredients ?? []).filter(
		(item) => !NOISE_INGREDIENTS.has(item.name.trim().toLowerCase()),
	);
	const groups: { level: RiskLevel; label: string; items: ScanIngredient[] }[] = [
		{ level: "high", label: "Higher risk", items: safeIngredients.filter((i) => i.level === "high") },
		{ level: "medium", label: "Watch for", items: safeIngredients.filter((i) => i.level === "medium") },
		{ level: "low", label: "Easier on your gut", items: safeIngredients.filter((i) => i.level === "low") },
	];
	const visibleGroups = groups.filter((group) => group.items.length > 0);

	if (visibleGroups.length === 0) {
		return null;
	}

	return (
		<View style={resultCardStyle}>
			<Text style={cardTitleStyle}>{title}</Text>
			<View style={styles.ingredientGroups}>
				{visibleGroups.map((group) => (
					<IngredientGroup
						key={group.level}
						label={group.label}
						level={group.level}
						items={group.items}
					/>
				))}
			</View>
		</View>
	);
}

export function DietFitCard({ evaluations }: { evaluations?: DietEvaluation[] }) {
	const safeEvaluations = evaluations ?? [];
	if (!safeEvaluations.length) {
		return null;
	}

	return (
		<View style={resultCardStyle}>
			<Text style={cardTitleStyle}>Diet fit</Text>
			<View style={styles.dietRows}>
				{safeEvaluations.map((evaluation) => {
					const color = colorForDietStatus(evaluation.status);
					return (
						<View key={evaluation.dietKey} style={styles.dietRow}>
							<View style={[styles.dietStatusDot, { backgroundColor: color }]} />
							<View style={styles.dietRowBody}>
								<Text style={styles.dietTitle}>
									{dietStatusLabel(evaluation.status)} {evaluation.dietLabel}
								</Text>
								<Text style={styles.dietReason}>{evaluation.reason}</Text>
							</View>
						</View>
					);
				})}
			</View>
		</View>
	);
}

function IngredientGroup({
	label,
	level,
	items,
}: {
	label: string;
	level: RiskLevel;
	items: ScanIngredient[];
}) {
	const color = colorForLevel(level);
	return (
		<View style={styles.ingredientGroup}>
			<View style={styles.ingredientGroupHeader}>
				<View style={[styles.ingredientGroupDot, { backgroundColor: color }]} />
				<Text style={[styles.ingredientGroupLabel, { color }]}>{label}</Text>
				<Text style={styles.ingredientGroupCount}>
					{items.length} item{items.length === 1 ? "" : "s"}
				</Text>
			</View>
			<View style={styles.ingredientChipWrap}>
				{items.map((item) => (
					<IngredientChip key={item.name} ingredient={item} />
				))}
			</View>
		</View>
	);
}

function IngredientChip({ ingredient }: { ingredient: ScanIngredient }) {
	const color = colorForLevel(ingredient.level);
	return (
		<View style={styles.ingredientChip}>
			<View style={[styles.ingredientChipDot, { backgroundColor: color }]} />
			<Text style={styles.ingredientChipName} numberOfLines={1}>
				{ingredient.name}
			</Text>
		</View>
	);
}



const styles = StyleSheet.create({
	ingredientGroups: {
		gap: spacing.md,
	},
	dietRows: {
		gap: spacing.sm,
	},
	dietRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	dietStatusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginTop: 5,
	},
	dietRowBody: {
		flex: 1,
		gap: 2,
	},
	dietTitle: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
	},
	dietReason: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 13,
		lineHeight: 18,
	},
	ingredientGroup: {
		gap: spacing.xs,
	},
	ingredientGroupHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	ingredientGroupDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	ingredientGroupLabel: {
		flex: 1,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	ingredientGroupCount: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	ingredientChipWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	ingredientChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
		maxWidth: "100%",
	},
	ingredientChipDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	ingredientChipName: {
		color: palette.text,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "capitalize",
		flexShrink: 1,
	},
});

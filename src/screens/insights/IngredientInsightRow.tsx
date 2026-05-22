import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, tokens, type } from "../../theme";
import { IngredientInsight } from "../../types/domain";

type IngredientInsightRowProps = {
	insight: IngredientInsight;
	variant: "trigger" | "safe";
	onPress: () => void;
};

export function IngredientInsightRow({ insight, variant, onPress }: IngredientInsightRowProps) {
	const tone = toneForInsight(insight, variant);
	const verdict = verdictForInsight(insight, variant);
	const evidenceLabel = formatEvidence(insight.supportingEvidenceCount);
	const contextLabel =
		insight.linkedConditions.length > 0
			? insight.linkedConditions.slice(0, 2).join(", ")
			: null;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${insight.ingredientName}, ${verdict}`}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
		>
			<View style={[styles.glyph, { backgroundColor: tone.background }]}>
				<Text style={[styles.glyphLabel, { color: tone.foreground }]}>
					{insight.ingredientName.charAt(0).toUpperCase()}
				</Text>
			</View>
			<View style={styles.copy}>
				<Text style={styles.title} numberOfLines={1}>
					{insight.ingredientName}
				</Text>
				<Text style={styles.meta} numberOfLines={1}>
					{evidenceLabel}
					{contextLabel ? ` · ${contextLabel}` : ""}
				</Text>
			</View>
			<View style={[styles.verdictPill, { backgroundColor: tone.background }]}>
				<Text style={[styles.verdictLabel, { color: tone.foreground }]}>{verdict}</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

function toneForInsight(insight: IngredientInsight, variant: "trigger" | "safe") {
	if (variant === "safe") {
		return tokens.color.status.risk.low;
	}

	if (insight.combinedRiskScore >= 70) {
		return tokens.color.status.risk.high;
	}

	return tokens.color.status.risk.medium;
}

function verdictForInsight(insight: IngredientInsight, variant: "trigger" | "safe") {
	if (variant === "safe") {
		return "Calm";
	}

	if (insight.combinedRiskScore >= 70) {
		return "Avoid";
	}

	return "Limit";
}

function formatEvidence(count: number) {
	if (count === 0) return "Early signal";
	return `Seen ${count} ${count === 1 ? "time" : "times"}`;
}

const styles = StyleSheet.create({
	row: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	glyph: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
	},
	glyphLabel: {
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	copy: {
		flex: 1,
		gap: 2,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
		textTransform: "capitalize",
	},
	meta: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	verdictPill: {
		minHeight: 26,
		borderRadius: radii.pill,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	verdictLabel: {
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.4,
		textTransform: "uppercase",
	},
});

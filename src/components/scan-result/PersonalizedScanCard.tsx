import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
	colorForDietStatus,
	type RiskLevel,
} from "./common";
import {
	dietEvaluationTitle,
	displayIngredientName,
	selectIngredientHistoryRows,
	type IngredientHistoryRow,
} from "./PersonalizedScanCard.helpers";
import { palette, spacing, tokens, type } from "../../theme";
import type { DietEvaluation, ScanIngredientRisk } from "../../types/domain";

export function PersonalizedScanCard({
	dietEvaluations,
	ingredientRisks,
	level,
	impactSummary,
}: {
	dietEvaluations?: DietEvaluation[];
	ingredientRisks?: ScanIngredientRisk[];
	level: RiskLevel;
	impactSummary?: string;
}) {
	const safeDietEvaluations = dietEvaluations ?? [];
	const historyRows = selectIngredientHistoryRows(ingredientRisks, 4);
	const impact = impactSummary?.trim();

	if (!safeDietEvaluations.length && !historyRows.length && !impact) {
		return null;
	}

	const impactTone = tokens.color.status.risk[level];

	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>Personalized for you</Text>

			{impact ? (
				<View style={styles.sectionBlock}>
					<Text style={styles.sectionLabel}>Your Gut Score</Text>
					<View style={[styles.impactRow, { backgroundColor: impactTone.background }]}>
						<Ionicons name="pulse-outline" size={16} color={impactTone.foreground} />
						<Text style={[styles.impactText, { color: impactTone.foreground }]}>{impact}</Text>
					</View>
				</View>
			) : null}

			{safeDietEvaluations.length ? (
				<View style={styles.sectionBlock}>
					<Text style={styles.sectionLabel}>Diet fit</Text>
					<DietEvaluationRows evaluations={safeDietEvaluations} />
				</View>
			) : null}

			{historyRows.length ? (
				<View style={styles.sectionBlock}>
					<Text style={styles.sectionLabel}>Ingredient history</Text>
					<IngredientHistoryRows rows={historyRows} />
				</View>
			) : null}
		</View>
	);
}

export function DietEvaluationRows({ evaluations }: { evaluations: DietEvaluation[] }) {
	if (!evaluations.length) return null;

	return (
		<View style={styles.rowStack}>
			{evaluations.map((evaluation) => {
				const color = colorForDietStatus(evaluation.status);
				return (
					<View key={evaluation.dietKey} style={styles.dietRow}>
						<View style={[styles.statusDot, { backgroundColor: color }]} />
						<View style={styles.rowBody}>
							<Text style={styles.rowTitle}>{dietEvaluationTitle(evaluation)}</Text>
							<Text style={styles.rowDetail}>{evaluation.reason}</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

export function IngredientHistoryRows({ rows }: { rows: IngredientHistoryRow[] }) {
	if (!rows.length) return null;

	return (
		<View style={styles.rowStack}>
			{rows.map(({ ingredient, history }) => {
				const tone = historyTone(history.riskLevel);
				return (
					<View key={`${ingredient.id ?? ingredient.canonicalName}-${ingredient.displayOrder}`} style={styles.historyRow}>
						<View style={[styles.historyIcon, { backgroundColor: tone.background }]}>
							<Ionicons name={historyIconName(history.riskLevel)} size={14} color={tone.foreground} />
						</View>
						<View style={styles.rowBody}>
							<Text style={styles.rowTitle} numberOfLines={1}>
								{displayIngredientName(ingredient)}
							</Text>
							<Text style={styles.rowDetail} numberOfLines={2}>
								{history.summary}
								{history.matchType === "family" && history.matchedLabel
									? ` · related to ${history.matchedLabel}`
									: ""}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

function historyTone(riskLevel: NonNullable<ScanIngredientRisk["personalHistory"]>["riskLevel"]) {
	if (riskLevel === "high") return tokens.color.status.risk.high;
	if (riskLevel === "low") return tokens.color.status.risk.low;
	if (riskLevel === "medium" || riskLevel === "inconsistent") return tokens.color.status.risk.medium;
	return {
		background: tokens.color.surface.card.info,
		foreground: palette.textMuted,
		tint: palette.textMuted,
	};
}

function historyIconName(riskLevel: NonNullable<ScanIngredientRisk["personalHistory"]>["riskLevel"]) {
	if (riskLevel === "high") return "alert-circle-outline";
	if (riskLevel === "low") return "checkmark-circle-outline";
	if (riskLevel === "medium" || riskLevel === "inconsistent") return "analytics-outline";
	return "time-outline";
}

const styles = StyleSheet.create({
	resultCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	sectionBlock: {
		gap: spacing.sm,
	},
	sectionLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	rowStack: {
		gap: spacing.xs,
	},
	dietRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	statusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginTop: 5,
	},
	historyRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	historyIcon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	rowBody: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	rowTitle: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
		textTransform: "capitalize",
	},
	rowDetail: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 17,
	},
	impactRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
		borderRadius: 16,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	impactText: {
		flex: 1,
		...tokens.type.body.small,
		fontFamily: type.body.medium,
	},
});

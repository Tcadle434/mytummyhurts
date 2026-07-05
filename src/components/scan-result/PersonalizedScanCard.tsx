import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import {
	colorForDietStatus,
	type RiskLevel,
} from "./common";
import {
	buildIngredientHistoryModel,
	dietEvaluationTitle,
	newIngredientsLine,
	type IngredientHistoryDisplayRow,
} from "./PersonalizedScanCard.helpers";
import { cardTitleStyle, resultCardStyle, sectionLabelStyle } from "./styles";
import { verdictTone } from "../common/UI";
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
	const history = buildIngredientHistoryModel(ingredientRisks, 4);
	const impact = impactSummary?.trim();

	if (!safeDietEvaluations.length && !history.rows.length && !history.newCount && !impact) {
		return null;
	}

	const impactTone = tokens.color.status.risk[level];

	return (
		<View style={resultCardStyle}>
			<Text style={cardTitleStyle}>Personalized for you</Text>

			{impact ? (
				<View style={styles.sectionBlock}>
					<Text style={sectionLabelStyle}>Your Gut Score</Text>
					<View style={[styles.impactRow, { backgroundColor: impactTone.background }]}>
						<Ionicons name="pulse-outline" size={16} color={impactTone.foreground} />
						<Text style={[styles.impactText, { color: impactTone.foreground }]}>{impact}</Text>
					</View>
				</View>
			) : null}

			{safeDietEvaluations.length ? (
				<View style={styles.sectionBlock}>
					<Text style={sectionLabelStyle}>Diet fit</Text>
					<DietEvaluationRows evaluations={safeDietEvaluations} />
				</View>
			) : null}

			{history.rows.length || history.newCount ? (
				<View style={styles.sectionBlock}>
					<Text style={sectionLabelStyle}>Ingredient history</Text>
					<IngredientHistoryRows rows={history.rows} />
					{history.newCount ? (
						<View style={styles.newFoodsRow}>
							<Ionicons name="leaf-outline" size={14} color={tokens.color.text.tertiary} />
							<Text style={styles.newFoodsText}>{newIngredientsLine(history.newCount)}</Text>
						</View>
					) : null}
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

// Rows carry real verdicts only (the model already filtered filler into the
// newCount line), so the icon bubble's tone always MEANS something.
export function IngredientHistoryRows({ rows }: { rows: IngredientHistoryDisplayRow[] }) {
	if (!rows.length) return null;

	return (
		<View style={styles.rowStack}>
			{rows.map(({ ingredient, title, line, status }) => {
				const tone = verdictTone(status);
				return (
					<View key={`${ingredient.id ?? ingredient.canonicalName}-${ingredient.displayOrder}`} style={styles.historyRow}>
						<View style={[styles.historyIcon, { backgroundColor: tone.background }]}>
							<Ionicons name={historyIconName(status)} size={14} color={tone.foreground} />
						</View>
						<View style={styles.rowBody}>
							<Text style={styles.rowTitle} numberOfLines={1}>
								{title}
							</Text>
							<Text style={styles.rowDetail} numberOfLines={2}>
								{line}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

function historyIconName(status: IngredientHistoryDisplayRow["status"]) {
	if (status === "confirmed") return "alert-circle-outline" as const;
	if (status === "suspect") return "analytics-outline" as const;
	if (status === "cleared") return "checkmark-done-circle-outline" as const;
	if (status === "safe") return "checkmark-circle-outline" as const;
	return "time-outline" as const;
}

const styles = StyleSheet.create({
	sectionBlock: {
		gap: spacing.sm,
	},
	rowStack: {
		gap: spacing.xs,
	},
	// Flat rows on the white card — no tinted slabs. Beige panels inside a
	// white card reintroduce the surface mush Deep Garden killed, and a tint
	// that doesn't encode a verdict is a tint that lies. Color lives only in
	// the status dot / icon bubble, where it means something.
	dietRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingVertical: spacing.xs,
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
		paddingVertical: spacing.xs,
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
	newFoodsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.xs,
	},
	newFoodsText: {
		flex: 1,
		color: tokens.color.text.tertiary,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 17,
	},
});

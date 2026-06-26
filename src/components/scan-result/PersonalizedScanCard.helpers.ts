import type { DietEvaluation, DietFitStatus, ScanIngredientRisk } from "../../types/domain";

const NOISE_HISTORY_INGREDIENTS = new Set([
	"salt",
	"water",
	"vitamin e",
	"vitamin c",
	"citric acid",
	"sea salt",
]);

export type IngredientHistoryRow = {
	ingredient: ScanIngredientRisk;
	history: NonNullable<ScanIngredientRisk["personalHistory"]>;
};

export function selectIngredientHistoryRows(
	ingredients: ScanIngredientRisk[] | undefined,
	limit = 4,
): IngredientHistoryRow[] {
	return [...(ingredients ?? [])]
		.filter((ingredient) => {
			const name = displayIngredientName(ingredient).toLowerCase();
			return Boolean(ingredient.personalHistory) && !NOISE_HISTORY_INGREDIENTS.has(name);
		})
		.map((ingredient, index) => ({
			ingredient,
			history: ingredient.personalHistory!,
			index,
		}))
		.sort((left, right) => {
			return historyRank(right.history) - historyRank(left.history) || left.index - right.index;
		})
		.slice(0, limit)
		.map(({ ingredient, history }) => ({ ingredient, history }));
}

export function dietEvaluationTitle(evaluation: DietEvaluation) {
	const verdict = evaluation.status === "caution" ? "Use caution" : dietStatusLabel(evaluation.status);
	return `${verdict} · ${evaluation.dietLabel}`;
}

export function displayIngredientName(ingredient: ScanIngredientRisk) {
	return ingredient.rawName || ingredient.canonicalName;
}

function historyRank(history: NonNullable<ScanIngredientRisk["personalHistory"]>) {
	const riskRank = history.riskLevel === "high" ? 4000 : history.riskLevel === "low" ? 3000 : history.riskLevel === "medium" ? 2000 : 1000;
	const matchRank = history.matchType === "exact" ? 200 : history.matchType === "family" ? 100 : 0;
	return riskRank + matchRank + history.supportingEvidenceCount * 10 + history.exactScanCount + history.familyScanCount;
}

function dietStatusLabel(status: DietFitStatus) {
	if (status === "does_not_fit") return "Doesn't fit";
	if (status === "unknown") return "Cannot verify";
	return "Fits";
}

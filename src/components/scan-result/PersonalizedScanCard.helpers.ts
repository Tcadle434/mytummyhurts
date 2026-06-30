import type { DietEvaluation, DietFitStatus, ScanIngredientRisk, ScoreContributor } from "../../types/domain";

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

export function selectMainSignalLabels(
	contributors: ScoreContributor[] | undefined,
	limit = 4,
): string[] {
	const seen = new Set<string>();
	const labels: string[] = [];

	for (const contributor of [...(contributors ?? [])]
		.filter((entry) => entry.key !== "base_menu_risk" && entry.points > 0)
		.sort((left, right) => Math.abs(right.points) - Math.abs(left.points) || right.points - left.points)) {
		const label = displaySignalLabel(contributor);
		const dedupeKey = label.toLowerCase();
		if (!label || seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		labels.push(label);
		if (labels.length >= limit) break;
	}

	return labels;
}

export function displaySignalLabel(contributor: Pick<ScoreContributor, "key" | "label" | "source">): string {
	const source = titleCaseFood(contributor.source);
	const sourceText = normalizeText(contributor.source);

	switch (contributor.key) {
		case "wheat_fructan_or_gluten":
			if (hasTerm(sourceText, ["crust", "dough", "flour"])) return "Wheat crust";
			if (hasTerm(sourceText, ["bread", "bun", "roll"])) return "Wheat bread";
			if (hasTerm(sourceText, ["pasta", "noodle", "ramen", "udon"])) return "Wheat pasta";
			return source;
		case "creamy_or_lactose":
			return `${source} dairy`;
		case "high_fat_or_rich":
			return `${source} richness`;
		case "acidic_tomato_citrus_vinegar":
		case "processed_meat":
		case "spicy_heat":
		case "alcohol":
		case "carbonation":
		case "caffeine":
			return source;
		case "fried_or_crispy":
			return "Fried prep";
		case "unknown_sauce_or_marinade":
			return sourceText === "sauce" || sourceText === "marinade" || sourceText === "dressing" ? "Unclear sauce" : source;
		case "reflux_mechanism_stack":
			return "Acid + richness";
		case "personal_creamy_or_lactose":
		case "personal_wheat_fructan_or_gluten":
		case "personal_high_fat_or_rich":
		case "personal_acidic_tomato_citrus_vinegar":
			return contributor.label || source;
		default:
			return machineTitleLabel(contributor.label) ? fallbackLabelFromKey(contributor.key, source) : contributor.label || source;
	}
}

function historyRank(history: NonNullable<ScanIngredientRisk["personalHistory"]>) {
	const riskRank =
		history.riskLevel === "high"
			? 5000
			: history.riskLevel === "inconsistent"
				? 4000
				: history.riskLevel === "low"
					? 3000
					: history.riskLevel === "medium"
						? 2000
						: 1000;
	const matchRank = history.matchType === "exact" ? 200 : history.matchType === "family" ? 100 : 0;
	return riskRank + matchRank + history.supportingEvidenceCount * 10 + history.exactScanCount + history.familyScanCount;
}

function normalizeText(value: string | undefined) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function titleCaseFood(value: string | undefined) {
	const text = normalizeText(value);
	if (!text) return "Food signal";
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function hasTerm(text: string, terms: string[]) {
	return terms.some((term) => ` ${text} `.includes(` ${normalizeText(term)} `));
}

function machineTitleLabel(label: string | undefined) {
	return Boolean(label && /\b(Or|And)\b/.test(label) && /^[A-Z][A-Za-z ]+$/.test(label));
}

function fallbackLabelFromKey(key: string, source: string) {
	const readableByKey: Record<string, string> = {
		high_fiber_or_gassy: "Gassy plants",
		legume_gos: "Beans and legumes",
		high_fructose: "High-fructose foods",
		sweet_polyol: "Sugar alcohols",
		chocolate_or_mint: "Chocolate or mint",
		fermented_or_histamine: "Fermented foods",
		raw_or_undercooked: "Raw or undercooked",
	};
	return readableByKey[key] ?? source;
}

// NOTE: kept local (not imported from ./common) to keep this module react-native-free
// so it stays unit-testable in node. Phase 1 will extract a shared *pure* labels module.
function dietStatusLabel(status: DietFitStatus) {
	if (status === "does_not_fit") return "Doesn't fit";
	if (status === "caution") return "Use caution for";
	if (status === "unknown") return "Cannot verify";
	return "Fits";
}

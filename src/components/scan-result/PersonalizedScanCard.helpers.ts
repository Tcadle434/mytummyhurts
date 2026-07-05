import { triggerVerdictStatus, type TriggerVerdictStatus } from "@mth/shared-domain";

import { familyByKey } from "../../features/insights/triggerGroups";
import type { DietEvaluation, DietFitStatus, ScanIngredientRisk, ScoreContributor } from "../../types/domain";

const NOISE_HISTORY_INGREDIENTS = new Set([
	"salt",
	"water",
	"vitamin e",
	"vitamin c",
	"citric acid",
	"sea salt",
]);

type PersonalHistory = NonNullable<ScanIngredientRisk["personalHistory"]>;

// Ingredient history speaks the caseboard vocabulary — the same verdict words
// and calm/rough day counts as the Triggers screen. Rows render ONLY when real
// outcome evidence exists; everything else collapses into one "new to your
// profile" line instead of a stack of "still learning" filler.
export type IngredientHistoryDisplayRow = {
	ingredient: ScanIngredientRisk;
	title: string;
	line: string;
	status: TriggerVerdictStatus;
};

export type IngredientHistoryModel = {
	rows: IngredientHistoryDisplayRow[];
	newCount: number;
};

const HISTORY_STATUS_WORD: Record<TriggerVerdictStatus, string> = {
	confirmed: "Confirmed trigger",
	suspect: "Under review",
	watching: "Watching",
	safe: "Looking safe",
	cleared: "Cleared",
};

function historyVerdict(history: PersonalHistory): TriggerVerdictStatus {
	return triggerVerdictStatus({
		combinedRiskScore: history.riskScore ?? 50,
		confidenceLevel: history.confidenceLevel ?? "low",
		positiveEvidenceCount: history.positiveEvidenceCount,
		negativeEvidenceCount: history.negativeEvidenceCount,
		declared: false,
	});
}

function evidenceCounts(history: PersonalHistory): string {
	const parts: string[] = [];
	if (history.negativeEvidenceCount > 0) {
		parts.push(`${history.negativeEvidenceCount} rough day${history.negativeEvidenceCount === 1 ? "" : "s"}`);
	}
	if (history.positiveEvidenceCount > 0) {
		parts.push(`${history.positiveEvidenceCount} calm day${history.positiveEvidenceCount === 1 ? "" : "s"}`);
	}
	return parts.join(" · ");
}

const STATUS_DISPLAY_RANK: Record<TriggerVerdictStatus, number> = {
	confirmed: 5,
	suspect: 4,
	cleared: 3,
	safe: 2,
	watching: 1,
};

export function buildIngredientHistoryModel(
	ingredients: ScanIngredientRisk[] | undefined,
	limit = 4,
): IngredientHistoryModel {
	const seen = new Set<string>();
	const evidenced: Array<IngredientHistoryDisplayRow & { outcomes: number }> = [];
	let newCount = 0;

	for (const ingredient of ingredients ?? []) {
		const history = ingredient.personalHistory;
		const title = displayIngredientName(ingredient);
		const name = title.toLowerCase();
		if (!history || NOISE_HISTORY_INGREDIENTS.has(name) || seen.has(name)) continue;
		seen.add(name);

		const outcomes = history.positiveEvidenceCount + history.negativeEvidenceCount;

		if (history.matchType === "exact" && outcomes > 0) {
			const status = historyVerdict(history);
			evidenced.push({
				ingredient,
				title,
				line: `${HISTORY_STATUS_WORD[status]} · ${evidenceCounts(history)}`,
				status,
				outcomes,
			});
			continue;
		}

		if (history.matchType === "family" && outcomes > 0 && history.matchedFamilyKey) {
			// Family evidence names the FAMILY — never a sibling ingredient
			// ("related to mayonnaise" is exactly the leak this replaces).
			const family = familyByKey(history.matchedFamilyKey);
			if (family) {
				const status = historyVerdict(history);
				evidenced.push({
					ingredient,
					title,
					line: `Part of ${family.label} — ${evidenceCounts(history)} across similar foods`,
					status,
					outcomes,
				});
				continue;
			}
		}

		newCount += 1;
	}

	const rows = evidenced
		.sort(
			(left, right) =>
				STATUS_DISPLAY_RANK[right.status] - STATUS_DISPLAY_RANK[left.status] ||
				right.outcomes - left.outcomes,
		)
		.slice(0, limit)
		.map(({ outcomes: _outcomes, ...row }) => row);

	return { rows, newCount };
}

export function newIngredientsLine(count: number): string {
	return count === 1
		? "1 food here is new to your profile — check-ins start its case."
		: `${count} foods here are new to your profile — check-ins start their cases.`;
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

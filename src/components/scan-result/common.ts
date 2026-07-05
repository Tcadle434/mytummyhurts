import { LayoutAnimation, Platform, UIManager } from "react-native";

import { tokens } from "../../theme";
import type {
	ConsumptionPortion,
	DietEvaluation,
	DietFitStatus,
	ScanIngredientRisk,
	ScoreContributor,
} from "../../types/domain";

if (
	Platform.OS === "android" &&
	UIManager.setLayoutAnimationEnabledExperimental
) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type RiskLevel = "low" | "medium" | "high";

export type ScanIngredient = {
	name: string;
	level: RiskLevel;
};

export type MenuTierItem = {
	id: string;
	name: string;
	section?: string;
	price?: string;
	score: number;
	level: RiskLevel;
	reason: string;
	insight?: string;
	triggers?: string[];
	scoreContributors?: ScoreContributor[];
	scoringConfidence?: "low" | "medium" | "high";
	dietEvaluations?: DietEvaluation[];
	ingredientRisks?: ScanIngredientRisk[];
	saferSwap?: string;
	sourceItemId?: string;
	consumed?: boolean;
	// Portion answer for a logged item; shown as the selected chip.
	portion?: ConsumptionPortion;
};

export function colorForLevel(level: RiskLevel) {
	if (level === "high") return tokens.color.status.risk.high.tint;
	if (level === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

const PERSONAL_EVIDENCE = new Set<ScoreContributor["evidence"]>(["profile", "learning"]);

export function isPersonalContributor(contributor: ScoreContributor) {
	return PERSONAL_EVIDENCE.has(contributor.evidence);
}

// Personalization receipts: contributors derived from the user's own profile or
// learned history are pinned ahead of generic rubric drivers so every result
// visibly reflects what the user told us.
export function prioritizeScoreContributors(
	contributors: ScoreContributor[] | undefined,
	limit = 4,
) {
	return [...(contributors ?? [])]
		.filter((contributor) => contributor.key !== "base_menu_risk")
		.sort((left, right) => {
			const leftPersonal = isPersonalContributor(left) ? 1 : 0;
			const rightPersonal = isPersonalContributor(right) ? 1 : 0;
			return rightPersonal - leftPersonal || Math.abs(right.points) - Math.abs(left.points);
		})
		.slice(0, limit);
}

export function toggleExpandedId(
	current: string | null,
	id: string,
	setter: (next: string | null) => void
) {
	LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
	setter(current === id ? null : id);
}

export function colorForDietStatus(status: DietFitStatus) {
	if (status === "does_not_fit") return tokens.color.status.risk.high.tint;
	if (status === "caution" || status === "unknown") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

export function dietStatusLabel(status: DietFitStatus) {
	if (status === "does_not_fit") return "Doesn't fit";
	if (status === "caution") return "Use caution for";
	if (status === "unknown") return "Cannot verify";
	return "Fits";
}

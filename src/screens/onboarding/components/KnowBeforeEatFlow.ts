export type KnowBeforeEatStage =
	| "menu-scan"
	| "menu-loading"
	| "menu-result"
	| "food-scan"
	| "food-loading"
	| "food-result"
	| "barcode-scan"
	| "barcode-loading"
	| "barcode-result";

export function knowBeforeEatCtaLabel(stage: KnowBeforeEatStage) {
	switch (stage) {
		case "menu-scan":
		case "food-scan":
		case "barcode-scan":
			return "Scan";
		case "menu-loading":
		case "food-loading":
		case "barcode-loading":
			return "Analyzing...";
		case "menu-result":
			return "Scan food";
		case "food-result":
			return "Scan grocery item";
		case "barcode-result":
			return "Show me my Gut Score";
	}
}

export function nextKnowBeforeEatStageOnTap(
	stage: KnowBeforeEatStage
): KnowBeforeEatStage | "advance" | null {
	switch (stage) {
		case "menu-scan":
			return "menu-loading";
		case "menu-result":
			return "food-scan";
		case "food-scan":
			return "food-loading";
		case "food-result":
			return "barcode-scan";
		case "barcode-scan":
			return "barcode-loading";
		case "barcode-result":
			return "advance";
		default:
			return null;
	}
}

export function previousKnowBeforeEatStage(stage: KnowBeforeEatStage): KnowBeforeEatStage {
	switch (stage) {
		case "menu-loading":
		case "menu-result":
			return "menu-scan";
		case "food-scan":
			return "menu-result";
		case "food-loading":
		case "food-result":
			return "food-scan";
		case "barcode-scan":
			return "food-result";
		case "barcode-loading":
		case "barcode-result":
			return "barcode-scan";
		case "menu-scan":
		default:
			return "menu-scan";
	}
}

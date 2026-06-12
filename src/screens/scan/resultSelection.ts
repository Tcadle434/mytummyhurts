import {
	MenuScanAnalysis,
	MenuScanResult,
	ScanMenuItemResult,
	ScanRecord,
	StructuredAnalysisV2,
} from "../../types/domain";

function asArray<T>(value: T[] | null | undefined): T[] {
	return Array.isArray(value) ? value : [];
}

function normalizeStructuredAnalysis(scan: ScanRecord): StructuredAnalysisV2 {
	const structured = scan.structuredAnalysis ?? ({} as Partial<StructuredAnalysisV2>);
	return {
		dishName: structured.dishName ?? scan.dishName ?? "Unknown meal",
		dishConfidence: structured.dishConfidence ?? "medium",
		clarity: structured.clarity ?? "clear",
		unclearReason: structured.unclearReason,
		components: asArray(structured.components),
		visibleIngredients: asArray(structured.visibleIngredients),
		inferredIngredients: asArray(structured.inferredIngredients),
		prepStyle: asArray(structured.prepStyle),
		notes: asArray(structured.notes),
		baseFoodCategory: structured.baseFoodCategory,
		riskModifiers: asArray(structured.riskModifiers),
		dietFitHypotheses: asArray(structured.dietFitHypotheses),
		scoreContributors: asArray(structured.scoreContributors),
		scoringConfidence: structured.scoringConfidence,
		gutRecommendation: structured.gutRecommendation,
		rubricVersion: structured.rubricVersion,
		model: structured.model ?? "unknown",
		promptVersion: structured.promptVersion ?? "unknown",
		imageDetail: structured.imageDetail ?? "not_applicable",
		menuAnalysis: structured.menuAnalysis ? normalizeMenuAnalysis(structured.menuAnalysis) : undefined,
	};
}

function normalizeMenuAnalysis(menuAnalysis: MenuScanAnalysis): MenuScanAnalysis {
	return {
		...menuAnalysis,
		items: asArray(menuAnalysis.items),
		bestOptions: asArray(menuAnalysis.bestOptions),
		eatWithCautionOptions: asArray(menuAnalysis.eatWithCautionOptions),
		worstOptions: asArray(menuAnalysis.worstOptions),
		summary: menuAnalysis.summary ?? "",
	};
}

function normalizeMenuItem(item: ScanMenuItemResult, index: number): ScanMenuItemResult {
	return {
		...item,
		id: item.id ?? item.sourceItemId ?? `menu-item-${index}`,
		sourceItemId: item.sourceItemId ?? item.id ?? `menu-item-${index}`,
		tier: item.tier ?? "eat_with_caution",
		tierRank: item.tierRank ?? index + 1,
		displayOrder: item.displayOrder ?? index,
		name: item.name ?? "Menu item",
		riskScore: item.riskScore ?? 50,
		riskLevel: item.riskLevel ?? "medium",
		confidence: item.confidence ?? "medium",
		scoringConfidence: item.scoringConfidence ?? item.confidence ?? "medium",
		scoreContributors: asArray(item.scoreContributors),
		whyThisScore: item.whyThisScore ?? item.description ?? "Scored from the available menu details.",
		ingredientRisks: asArray(item.ingredientRisks),
		dietEvaluations: asArray(item.dietEvaluations),
	};
}

function normalizeMenuResult(menuResult: MenuScanResult): MenuScanResult {
	const items = asArray(menuResult.items).map(normalizeMenuItem);
	return {
		...menuResult,
		menuTitle: menuResult.menuTitle ?? "Menu scan",
		inputPageCount: menuResult.inputPageCount ?? 1,
		summary: menuResult.summary ?? "",
		items,
		bestForYou: asArray(menuResult.bestForYou).map(normalizeMenuItem),
		eatWithCaution: asArray(menuResult.eatWithCaution).map(normalizeMenuItem),
		tryToAvoid: asArray(menuResult.tryToAvoid).map(normalizeMenuItem),
	};
}

export function normalizeScanRecord(scan: ScanRecord): ScanRecord {
	return {
		...scan,
		dishName: scan.dishName ?? "Unknown meal",
		overallRiskScore: scan.overallRiskScore ?? 0,
		overallRiskLevel: scan.overallRiskLevel ?? "low",
		conditionRiskScores: scan.conditionRiskScores ?? {},
		possibleTriggers: asArray(scan.possibleTriggers),
		interpretation: scan.interpretation ?? "This scan was saved before the latest result format.",
		riskModifiers: asArray(scan.riskModifiers),
		scoreContributors: asArray(scan.scoreContributors),
		conditionRisks: asArray(scan.conditionRisks),
		ingredientRisks: asArray(scan.ingredientRisks),
		dietEvaluations: asArray(scan.dietEvaluations),
		structuredAnalysis: normalizeStructuredAnalysis(scan),
		menuResult: scan.menuResult ? normalizeMenuResult(scan.menuResult) : undefined,
	};
}

export function hasMenuResult(scan: ScanRecord | undefined) {
	return scan?.scanCategory === "menu" && (Boolean(scan.menuResult) || Boolean(scan.structuredAnalysis?.menuAnalysis));
}

export function selectPreferredScan(
	storeScan: ScanRecord | undefined,
	detailScan: ScanRecord | undefined
) {
	return detailScan ?? storeScan;
}

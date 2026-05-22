import { describe, expect, it } from "vitest";

import { ScanRecord } from "../../../types/domain";
import { selectPreferredScan } from "../resultSelection";

function scan(overrides: Partial<ScanRecord>): ScanRecord {
	return {
		id: "scan-1",
		sourceType: "camera",
		scanCategory: "food",
		analysisStatus: "completed",
		tokenCost: 1,
		createdAt: "2026-05-20T00:00:00.000Z",
		dishName: "Scan",
		overallRiskScore: 42,
		overallRiskLevel: "medium",
		conditionRiskScores: {},
		possibleTriggers: [],
		interpretation: "Result",
		conditionRisks: [],
		ingredientRisks: [],
		structuredAnalysis: {
			dishName: "Scan",
			dishConfidence: "medium",
			clarity: "clear",
			components: [],
			visibleIngredients: [],
			inferredIngredients: [],
			prepStyle: [],
			notes: [],
			model: "test",
			promptVersion: "test",
			imageDetail: "not_applicable",
		},
		...overrides,
	};
}

describe("selectPreferredScan", () => {
	it("prefers fetched detail over a stale store record", () => {
		const staleStoreScan = scan({
			scanCategory: "menu",
			structuredAnalysis: {
				...scan({}).structuredAnalysis,
				dishName: "Menu",
			},
		});
		const historyScan = scan({
			scanCategory: "menu",
			structuredAnalysis: {
				...staleStoreScan.structuredAnalysis,
				menuAnalysis: {
					kind: "menu",
					menuTitle: "Menu",
					menuConfidence: "high",
					inputPageCount: 1,
					items: [],
					bestOptions: [],
					eatWithCautionOptions: [],
					worstOptions: [],
					summary: "Menu ranking",
				},
			},
		});

		expect(selectPreferredScan(staleStoreScan, historyScan)).toBe(historyScan);
	});
});

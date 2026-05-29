import { describe, expect, it } from "vitest";

import { ScanRecord } from "../../../types/domain";
import { normalizeScanRecord, selectPreferredScan } from "../resultSelection";

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
		dietEvaluations: [],
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

describe("normalizeScanRecord", () => {
	it("fills missing V2 arrays on legacy saved meal scans", () => {
		const legacyScan = {
			id: "scan-legacy",
			sourceType: "camera",
			scanCategory: "food",
			analysisStatus: "completed",
			tokenCost: 1,
			createdAt: "2026-05-20T00:00:00.000Z",
			dishName: "Old meal",
			overallRiskScore: 42,
			overallRiskLevel: "medium",
			conditionRiskScores: {},
			interpretation: "Old result",
		} as unknown as ScanRecord;

		const normalized = normalizeScanRecord(legacyScan);

		expect(normalized.possibleTriggers).toEqual([]);
		expect(normalized.conditionRisks).toEqual([]);
		expect(normalized.ingredientRisks).toEqual([]);
		expect(normalized.dietEvaluations).toEqual([]);
		expect(normalized.structuredAnalysis.visibleIngredients).toEqual([]);
		expect(normalized.structuredAnalysis.inferredIngredients).toEqual([]);
	});

	it("fills missing menu item arrays on legacy menu results", () => {
		const legacyMenuScan = scan({
			scanCategory: "menu",
			menuResult: {
				menuTitle: "Old menu",
				inputPageCount: 1,
				summary: "Old menu summary",
				items: [
					{
						id: "item-1",
						sourceItemId: "item-1",
						tier: "eat_with_caution",
						tierRank: 1,
						displayOrder: 0,
						name: "Old burger",
						riskScore: 55,
						riskLevel: "medium",
						confidence: "medium",
						scoringConfidence: "medium",
						whyThisScore: "Medium risk.",
					} as unknown as NonNullable<ScanRecord["menuResult"]>["items"][number],
				],
				bestForYou: [],
				eatWithCaution: [],
				tryToAvoid: [],
			},
		});

		const normalized = normalizeScanRecord(legacyMenuScan);
		const item = normalized.menuResult?.items[0];

		expect(item).toBeDefined();
		expect(item?.ingredientRisks).toEqual([]);
		expect(item?.dietEvaluations).toEqual([]);
		expect(item?.scoreContributors).toEqual([]);
	});
});

import { describe, expect, it } from "vitest";

import { dietEvaluationTitle, selectIngredientHistoryRows, selectMainSignalLabels } from "../PersonalizedScanCard.helpers";
import type { DietEvaluation, ScanIngredientRisk, ScoreContributor } from "../../../types/domain";

function ingredient(
	canonicalName: string,
	overrides: Partial<ScanIngredientRisk> = {},
): ScanIngredientRisk {
	return {
		rawName: canonicalName,
		canonicalName,
		riskScore: 20,
		riskLevel: "low",
		evidence: "visible",
		confidence: "high",
		reason: "",
		displayOrder: 0,
		...overrides,
	};
}

describe("PersonalizedScanCard helpers", () => {
	it("prioritizes rough/fine learned history ahead of brand-new rows", () => {
		const rows = selectIngredientHistoryRows([
			ingredient("turkey", {
				displayOrder: 0,
				personalHistory: {
					exactScanCount: 0,
					familyScanCount: 0,
					matchType: "none",
					riskLevel: "unknown",
					supportingEvidenceCount: 0,
					positiveEvidenceCount: 0,
					negativeEvidenceCount: 0,
					summary: "New for your history",
				},
			}),
			ingredient("bread", {
				displayOrder: 1,
				personalHistory: {
					exactScanCount: 6,
					familyScanCount: 0,
					matchType: "exact",
					riskLevel: "high",
					riskScore: 72,
					confidenceLevel: "high",
					supportingEvidenceCount: 6,
					positiveEvidenceCount: 0,
					negativeEvidenceCount: 4,
					summary: "Seen 6 times · usually rough for you",
				},
			}),
			ingredient("rice", {
				displayOrder: 2,
				personalHistory: {
					exactScanCount: 5,
					familyScanCount: 0,
					matchType: "exact",
					riskLevel: "low",
					riskScore: 32,
					confidenceLevel: "medium",
					supportingEvidenceCount: 5,
					positiveEvidenceCount: 4,
					negativeEvidenceCount: 0,
					summary: "Seen 5 times · usually sits fine",
				},
			}),
		]);

		expect(rows.map((row) => row.ingredient.canonicalName)).toEqual(["bread", "rice", "turkey"]);
	});

	it("renders concise diet verdict titles", () => {
		const evaluation: DietEvaluation = {
			dietKey: "low_fodmap",
			dietLabel: "Low FODMAP",
			status: "caution",
			confidence: "medium",
			reason: "Contains wheat bread.",
			supportingFactors: [],
			conflicts: ["wheat bread"],
			missingInfo: [],
			scoreAdjustment: 0,
			acceptedModelStatus: true,
			rubricVersion: "test",
		};

		expect(dietEvaluationTitle(evaluation)).toBe("Use caution · Low FODMAP");
	});

	it("turns machine-style score contributors into readable main signals", () => {
		const contributors: ScoreContributor[] = [
			{
				key: "unknown_sauce_or_marinade",
				label: "Unknown Sauce Or Marinade",
				points: 44,
				evidence: "ingredient",
				source: "tomato sauce",
				reason: "Stored old label.",
			},
			{
				key: "wheat_fructan_or_gluten",
				label: "Wheat Fructan Or Gluten",
				points: 8,
				evidence: "ingredient",
				source: "pizza dough",
				reason: "Stored old label.",
			},
			{
				key: "high_fat_or_rich",
				label: "High Fat Or Rich",
				points: 11,
				evidence: "ingredient",
				source: "cheese",
				reason: "Stored old label.",
			},
			{
				key: "fried_or_crispy",
				label: "Fried Or Crispy",
				points: 9,
				evidence: "prep",
				source: "fried",
				reason: "Stored old label.",
			},
		];

		const labels = selectMainSignalLabels(contributors, 4);
		expect(labels).toEqual(["Tomato sauce", "Cheese richness", "Fried prep", "Wheat crust"]);
		expect(labels).not.toContain("Unknown Sauce Or Marinade");
		expect(labels).not.toContain("Wheat Fructan Or Gluten");
		expect(labels).not.toContain("Fried Or Crispy");
	});
});

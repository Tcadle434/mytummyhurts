import { describe, expect, it } from "vitest";

import {
	buildIngredientHistoryModel,
	dietEvaluationTitle,
	newIngredientsLine,
	selectMainSignalLabels,
} from "../PersonalizedScanCard.helpers";
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
	it("speaks the caseboard vocabulary and collapses filler into the new-foods count", () => {
		const model = buildIngredientHistoryModel([
			// No evidence → collapses into newCount, never a filler row.
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
			// Seen twice but no paired outcomes → also filler → newCount.
			ingredient("rice cracker", {
				displayOrder: 1,
				personalHistory: {
					exactScanCount: 2,
					familyScanCount: 0,
					matchType: "exact",
					riskLevel: "unknown",
					supportingEvidenceCount: 0,
					positiveEvidenceCount: 0,
					negativeEvidenceCount: 0,
					summary: "Seen 2 times · still learning",
				},
			}),
			ingredient("bread", {
				displayOrder: 2,
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
				displayOrder: 3,
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

		// Evidence-backed rows only, risk first.
		expect(model.rows.map((row) => row.ingredient.canonicalName)).toEqual(["bread", "rice"]);
		expect(model.rows[0]?.line).toBe("Confirmed trigger · 4 rough days");
		expect(model.rows[0]?.status).toBe("confirmed");
		expect(model.rows[1]?.line).toBe("Cleared · 4 calm days");
		expect(model.newCount).toBe(2);
		expect(newIngredientsLine(model.newCount)).toBe(
			"2 foods here are new to your profile — check-ins start their cases.",
		);
	});

	it("names the family for family matches — never a sibling ingredient", () => {
		const model = buildIngredientHistoryModel([
			ingredient("avocado", {
				displayOrder: 0,
				personalHistory: {
					exactScanCount: 0,
					familyScanCount: 17,
					matchType: "family",
					matchedLabel: "mayonnaise",
					matchedFamilyKey: "plant_fats_spreads",
					riskLevel: "medium",
					riskScore: 55,
					confidenceLevel: "medium",
					supportingEvidenceCount: 3,
					positiveEvidenceCount: 1,
					negativeEvidenceCount: 2,
					summary: "Similar foods seen 17 times · still learning",
				},
			}),
			// Family match WITHOUT the family key (old server) → collapses to
			// newCount rather than leaking the sibling name.
			ingredient("sushi vinegar", {
				displayOrder: 1,
				personalHistory: {
					exactScanCount: 0,
					familyScanCount: 19,
					matchType: "family",
					matchedLabel: "mayonnaise",
					riskLevel: "medium",
					riskScore: 55,
					confidenceLevel: "medium",
					supportingEvidenceCount: 3,
					positiveEvidenceCount: 1,
					negativeEvidenceCount: 2,
					summary: "Similar foods seen 19 times · still learning",
				},
			}),
		]);

		expect(model.rows).toHaveLength(1);
		expect(model.rows[0]?.line).toBe(
			"Part of Fats, oils & spreads — 2 rough days · 1 calm day across similar foods",
		);
		expect(model.rows[0]?.line).not.toContain("mayonnaise");
		expect(model.newCount).toBe(1);
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

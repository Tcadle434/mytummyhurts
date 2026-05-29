import { describe, expect, it } from "vitest";

import { normalizeOnboardingAnswers, onboardingSteps } from "../onboarding";
import type { OnboardingAnswers } from "../../types/domain";

describe("normalizeOnboardingAnswers", () => {
	it("fills missing arrays for legacy persisted onboarding answers", () => {
		const legacyAnswers = {
			displayName: "Thomas",
			motivation: "Feel better",
		} as Partial<OnboardingAnswers>;

		const normalized = normalizeOnboardingAnswers(legacyAnswers);

		expect(normalized.displayName).toBe("Thomas");
		expect(normalized.conditions).toEqual([]);
		expect(normalized.customConditions).toEqual([]);
		expect(normalized.ingredientSensitivities).toEqual([]);
		expect(normalized.customIngredientSensitivities).toEqual([]);
		expect(normalized.symptoms).toEqual([]);
		expect(normalized.customSymptoms).toEqual([]);
		expect(normalized.mealContexts).toEqual([]);
		expect(normalized.currentEatingPatterns).toEqual([]);
		expect(normalized.lifestyleFactors).toEqual([]);
		expect(normalized.motivations).toEqual(["Feel better"]);
		expect(normalized.motivation).toBe("Feel better");
		expect(normalized.dietPreferenceKeys).toEqual([]);
		expect(normalized.dietPreferenceNone).toBe(false);
	});

	it("filters non-string entries from persisted arrays", () => {
		const normalized = normalizeOnboardingAnswers({
			conditions: ["IBS", null, 12],
			motivations: ["Avoid flare-ups", null, "Find safe foods"],
			dietPreferenceKeys: ["low_fodmap", "seed_oil_free", "low_histamine", undefined],
		} as unknown as Partial<OnboardingAnswers>);

		expect(normalized.conditions).toEqual(["IBS"]);
		expect(normalized.motivations).toEqual(["Avoid flare-ups", "Find safe foods"]);
		expect(normalized.motivation).toBe("Avoid flare-ups, Find safe foods");
		expect(normalized.dietPreferenceKeys).toEqual(["low_fodmap", "seed_oil_free", "low_histamine"]);
	});

	it("stores the goals screen as a multi-select motivations array", () => {
		const motivationStep = onboardingSteps.find((step) => step.id === "motivation");

		expect(motivationStep?.type).toBe("multi_select");
		expect(motivationStep?.field).toBe("motivations");
	});
});

import { describe, expect, it } from "vitest";

import { defaultOnboardingAnswers } from "../../../data/onboarding";
import type { OnboardingAnswers, OnboardingStepDefinition } from "../../../types/domain";
import {
	customFieldForOnboardingStep,
	customOptionCopyForOnboardingStep,
	onboardingStepHasRequiredAnswer,
} from "../OnboardingStepAnswers";

function step(
	type: OnboardingStepDefinition["type"],
	field?: OnboardingStepDefinition["field"]
): Pick<OnboardingStepDefinition, "field" | "type"> {
	return { type, field };
}

function answers(overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers {
	return { ...defaultOnboardingAnswers, ...overrides };
}

describe("onboarding step answers", () => {
	it.each([
		["conditions", "customConditions"],
		["ingredientSensitivities", "customIngredientSensitivities"],
		["symptoms", "customSymptoms"],
		["motivations", null],
	] as const)("maps %s to its custom field", (field, customField) => {
		expect(customFieldForOnboardingStep({ field })).toBe(customField);
	});

	it("provides field-specific custom option copy", () => {
		expect(customOptionCopyForOnboardingStep({ field: "conditions" }).title).toBe(
			"Add a custom condition"
		);
		expect(customOptionCopyForOnboardingStep({ field: "symptoms" }).title).toBe(
			"Add a custom symptom"
		);
		expect(
			customOptionCopyForOnboardingStep({ field: "ingredientSensitivities" }).title
		).toBe("Add a custom trigger");
	});

	it("requires a value for single-select steps", () => {
		const currentStep = step("single_select", "symptomFrequency");

		expect(onboardingStepHasRequiredAnswer(currentStep, answers())).toBe(false);
		expect(
			onboardingStepHasRequiredAnswer(
				currentStep,
				answers({ symptomFrequency: "Most days" })
			)
		).toBe(true);
	});

	it("accepts catalog or custom values for multi-select steps", () => {
		const currentStep = step("multi_select", "conditions");

		expect(onboardingStepHasRequiredAnswer(currentStep, answers())).toBe(false);
		expect(
			onboardingStepHasRequiredAnswer(currentStep, answers({ conditions: ["IBS"] }))
		).toBe(true);
		expect(
			onboardingStepHasRequiredAnswer(
				currentStep,
				answers({ customConditions: ["Gastritis"] })
			)
		).toBe(true);
	});

	it("accepts the explicit unknown sensitivity choice", () => {
		expect(
			onboardingStepHasRequiredAnswer(
				step("multi_select", "ingredientSensitivities"),
				answers({ ingredientSensitivitiesUnknown: true })
			)
		).toBe(true);
	});

	it("accepts a diet preference or the explicit none choice", () => {
		const currentStep = step("multi_select", "dietPreferenceKeys");

		expect(onboardingStepHasRequiredAnswer(currentStep, answers())).toBe(false);
		expect(
			onboardingStepHasRequiredAnswer(currentStep, answers({ dietPreferenceNone: true }))
		).toBe(true);
		expect(
			onboardingStepHasRequiredAnswer(
				currentStep,
				answers({ dietPreferenceKeys: ["gluten_free"] })
			)
		).toBe(true);
	});

	it("does not require answers for non-selection steps", () => {
		expect(onboardingStepHasRequiredAnswer(step("message"), answers())).toBe(true);
	});
});

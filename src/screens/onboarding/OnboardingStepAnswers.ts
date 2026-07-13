import type { OnboardingAnswers, OnboardingStepDefinition } from "../../types/domain";

export type CustomOnboardingField =
	| "customConditions"
	| "customIngredientSensitivities"
	| "customSymptoms";

export interface CustomOptionCopy {
	title: string;
	subtitle: string;
	placeholder: string;
}

export function customFieldForOnboardingStep(
	step: Pick<OnboardingStepDefinition, "field">
): CustomOnboardingField | null {
	if (step.field === "conditions") return "customConditions";
	if (step.field === "ingredientSensitivities") {
		return "customIngredientSensitivities";
	}
	if (step.field === "symptoms") return "customSymptoms";
	return null;
}

export function customOptionCopyForOnboardingStep(
	step: Pick<OnboardingStepDefinition, "field">
): CustomOptionCopy {
	if (step.field === "conditions") {
		return {
			title: "Add a custom condition",
			subtitle: "Add anything we should consider when personalizing your scans.",
			placeholder: "Example: SIBO, gastritis, Crohn's",
		};
	}

	if (step.field === "symptoms") {
		return {
			title: "Add a custom symptom",
			subtitle: "Add any symptom you want your daily reports to track.",
			placeholder: "Example: cramping, burping, trapped gas",
		};
	}

	return {
		title: "Add a custom trigger",
		subtitle: "Add any food or ingredient you already suspect.",
		placeholder: "Example: eggs, soy, coffee",
	};
}

export function onboardingStepHasRequiredAnswer(
	step: Pick<OnboardingStepDefinition, "field" | "type">,
	answers: OnboardingAnswers
): boolean {
	if (step.type === "single_select" && step.field) {
		const value = answers[step.field];
		return Array.isArray(value) ? value.length > 0 : Boolean(value);
	}

	if (step.type === "multi_select" && step.field) {
		if (step.field === "dietPreferenceKeys") {
			return Boolean(answers.dietPreferenceNone) || answers.dietPreferenceKeys.length > 0;
		}

		if (
			step.field === "ingredientSensitivities" &&
			answers.ingredientSensitivitiesUnknown
		) {
			return true;
		}

		const value = answers[step.field];
		const customField = customFieldForOnboardingStep(step);
		const customValues = customField ? answers[customField] : [];
		return (Array.isArray(value) && value.length > 0) || customValues.length > 0;
	}

	return true;
}

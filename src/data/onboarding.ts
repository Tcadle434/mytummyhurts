import {
	conditionOptions,
	dietPreferenceOnboardingOptions,
	ingredientSensitivityOptions,
	motivationOptions,
	symptomFrequencyOptions,
	symptomOptions,
	symptomSeverityOptions,
	triedGutHealthAppsOptions,
} from "./catalog";
import { PipState } from "../theme";
import { FoodCalibrationRating, OnboardingAnswers, OnboardingStepDefinition } from "../types/domain";

export const defaultOnboardingAnswers: OnboardingAnswers = {
	displayName: "",
	conditions: [],
	customConditions: [],
	ingredientSensitivities: [],
	customIngredientSensitivities: [],
	ingredientSensitivitiesUnknown: false,
	foodCalibrations: {},
	lastBadMealText: "",
	symptoms: [],
	customSymptoms: [],
	mealContexts: [],
	currentEatingPatterns: [],
	lifestyleFactors: [],
	favoriteFoodsToReintroduce: "",
	dietPreferenceKeys: [],
	dietPreferenceNone: false,
	motivations: [],
};

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string")
		: [];
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function calibrationRecord(value: unknown): Record<string, FoodCalibrationRating> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return Object.entries(value as Record<string, unknown>).reduce<Record<string, FoodCalibrationRating>>(
		(accumulator, [food, rating]) => {
			if (rating === "fine" || rating === "unsure" || rating === "bad") {
				accumulator[food] = rating;
			}
			return accumulator;
		},
		{}
	);
}

export function normalizeOnboardingAnswers(
	answers: Partial<OnboardingAnswers> | null | undefined
): OnboardingAnswers {
	const current = answers ?? {};
	const motivations = stringArray(current.motivations);
	const legacyMotivation = optionalString(current.motivation);
	return {
		...defaultOnboardingAnswers,
		...current,
		displayName: optionalString(current.displayName) ?? defaultOnboardingAnswers.displayName,
		conditions: stringArray(current.conditions),
		customConditions: stringArray(current.customConditions),
		ingredientSensitivities: stringArray(current.ingredientSensitivities),
		customIngredientSensitivities: stringArray(current.customIngredientSensitivities),
		ingredientSensitivitiesUnknown: Boolean(current.ingredientSensitivitiesUnknown),
		foodCalibrations: calibrationRecord(current.foodCalibrations),
		lastBadMealText: optionalString(current.lastBadMealText) ?? defaultOnboardingAnswers.lastBadMealText,
		symptoms: stringArray(current.symptoms),
		customSymptoms: stringArray(current.customSymptoms),
		symptomFrequency: optionalString(current.symptomFrequency),
		symptomSeverityBaseline: optionalString(current.symptomSeverityBaseline),
		mealContexts: stringArray(current.mealContexts),
		triedOtherGutHealthApps: optionalString(current.triedOtherGutHealthApps),
		motivation: getOnboardingMotivationSummary({
			motivations,
			motivation: legacyMotivation,
		}),
		motivations: motivations.length > 0 ? motivations : legacyMotivation ? [legacyMotivation] : [],
		currentEatingPatterns: stringArray(current.currentEatingPatterns),
		lifestyleFactors: stringArray(current.lifestyleFactors),
		favoriteFoodsToReintroduce:
			optionalString(current.favoriteFoodsToReintroduce) ??
			defaultOnboardingAnswers.favoriteFoodsToReintroduce,
		dietPreferenceKeys: stringArray(
			current.dietPreferenceKeys
		) as OnboardingAnswers["dietPreferenceKeys"],
		dietPreferenceNone: Boolean(current.dietPreferenceNone),
	};
}

export function getOnboardingMotivationSummary(
	answers: Pick<Partial<OnboardingAnswers>, "motivation" | "motivations">
) {
	const motivations = stringArray(answers.motivations);
	if (motivations.length > 0) {
		return motivations.join(", ");
	}

	return optionalString(answers.motivation);
}

export const onboardingSteps: OnboardingStepDefinition[] = [
	{
		id: "welcome",
		step: 1,
		type: "message",
		backgroundVariant: "getStartedImage",
		headline: "Welcome to MyTummyHurts",
		body: "Learn how you'll feel before you eat it.",
		cta: "Let's Go",
	},
	{
		id: "empathy-problem",
		step: 2,
		type: "message",
		headline: "Sorry you aren't feeling well",
		body: "Stomach issues suck. They make you anxious about your health. They keep you from living your life.",
		centerGraphic: "empathyProblem",
		cta: "That's exactly me",
	},
	{
		id: "healing-promise",
		step: 3,
		type: "message",
		headline: "The good news is you CAN feel better",
		body: "And we're going to help you do it. Get your confidence back. Get your health back. Get your life back.",
		centerGraphic: "healingPromise",
		cta: "Help me do it",
	},
	{
		id: "conditions-select",
		step: 4,
		type: "multi_select",
		backgroundVariant: "getStartedImage",
		headline: "Do you have any pre-existing gut conditions?",
		body: "",
		cta: "Continue",
		field: "conditions",
		options: conditionOptions,
		allowCustom: true,
	},
	{
		id: "ingredient-select",
		step: 5,
		type: "multi_select",
		backgroundVariant: "getStartedImage",
		headline: "Are there any specific foods that bother you?",
		body: "It's okay if you don't know. We will learn how you respond to food over time.",
		cta: "Continue",
		field: "ingredientSensitivities",
		options: ingredientSensitivityOptions,
		allowCustom: true,
	},
	{
		id: "food-calibration",
		step: 5,
		type: "calibration",
		backgroundVariant: "getStartedImage",
		headline: "How do these usually treat you?",
		body: "Quick gut check on common trigger foods. Your answers become the starting suspects we investigate.",
		cta: "Continue",
		field: "foodCalibrations",
	},
	{
		id: "last-bad-meal",
		step: 6,
		type: "text_input",
		backgroundVariant: "getStartedImage",
		headline: "What was the last meal that wrecked you?",
		body: "Describe it however you remember it — \"chicken alfredo and garlic bread\" works. We'll pull out the likely suspects.",
		helper: "Optional, but it gives your profile a head start.",
		cta: "Continue",
		field: "lastBadMealText",
	},
	{
		id: "symptoms-select",
		step: 6,
		type: "multi_select",
		backgroundVariant: "getStartedImage",
		headline: "Which symptoms do you deal with most often?",
		body: "",
		cta: "Continue",
		field: "symptoms",
		options: symptomOptions,
		allowCustom: true,
	},
	{
		id: "frequency-select",
		step: 7,
		type: "single_select",
		backgroundVariant: "getStartedImage",
		headline: "How often do you feel these symptoms?",
		body: "",
		cta: "Continue",
		field: "symptomFrequency",
		options: symptomFrequencyOptions,
	},
	{
		id: "severity-select",
		step: 8,
		type: "single_select",
		backgroundVariant: "getStartedImage",
		headline: "When it happens, how bad does it usually get?",
		body: "",
		cta: "Help me fix this",
		field: "symptomSeverityBaseline",
		options: symptomSeverityOptions,
	},
	{
		id: "diet-goal-select",
		step: 9,
		type: "multi_select",
		backgroundVariant: "getStartedImage",
		headline: "Are you trying to follow a specific diet?",
		body: "If you are, we'll help you follow it.",
		cta: "Continue",
		field: "dietPreferenceKeys",
		options: dietPreferenceOnboardingOptions,
	},
	{
		id: "know-before-eat",
		step: 10,
		type: "preview",
		headline: "Know before you eat",
		body: "Our promise is to learn your stomach and help you learn how you'll feel BEFORE you eat.",
		cta: "Show me Gut Score",
		previewVariant: "knowBeforeEat",
	},
	{
		id: "personalized-promise",
		step: 10,
		type: "message",
		headline: "Tuned to your gut. No generic advice",
		body: "Every score you receive is personalized to your stomach. The more you scan and log, the smarter it gets.",
		centerGraphic: "personalGutPromise",
		cta: "Show me Gut Score",
	},
	{
		id: "gut-score-intro",
		step: 11,
		type: "message",
		headline: "Introducing Gut Score",
		body: "A numerical representation of your overall gut health.",
		centerGraphic: "gutScoreScale",
		cta: "Show me Daily Score",
	},
	{
		id: "daily-score-intro",
		step: 11,
		type: "message",
		headline: "Your Daily Score",
		body: "Gut score for one day. Think of it like a daily sleep or recovery score.",
		centerGraphic: "dailyScoreCard",
		cta: "Continue",
	},
	{
		id: "simple-plan",
		step: 12,
		type: "message",
		headline: "The goal is simple",
		body: "Learn how you will feel before you eat. Raise your Gut Score over time. Feel better every day.",
		footerBody: "Feel better about your tummy.",
		centerGraphic: "healingLoopDiagram",
		cta: "Let's do it",
	},
	// {
	// 	id: "phase-discovery",
	// 	step: 13,
	// 	type: "message",
	// 	headline: "Phase 1: Discovery",
	// 	body: "Scan your meals. Report how you feel. AI learns and adjusts risk scores.",
	// 	centerGraphic: "phaseDiscovery",
	// 	cta: "Next phase",
	// },
	// {
	// 	id: "phase-limitation",
	// 	step: 14,
	// 	type: "message",
	// 	headline: "Phase 2: Limit triggers",
	// 	body: "Avoid the ingredients that keep showing up on reactive days.",
	// 	centerGraphic: "phaseLimitation",
	// 	cta: "Next phase",
	// },
	// {
	// 	id: "phase-reintroduction",
	// 	step: 15,
	// 	type: "message",
	// 	headline: "Phase 3: Reintroduction",
	// 	body: "After a symptom-free stretch, test foods you miss in a controlled way.",
	// 	centerGraphic: "phaseReintroduction",
	// 	cta: "Continue",
	// },
	// {
	// 	id: "scanner-modes",
	// 	step: 16,
	// 	type: "message",
	// 	headline: "Multi-purpose food scanner",
	// 	body: "One scanner, everywhere.",
	// 	centerGraphic: "scannerModesOverview",
	// 	cta: "Continue",
	// },
	// "issues-rising" cut: pure narrative, no data collection (see plan).
	// {
	// 	id: "food-control-intro",
	// 	step: 18,
	// 	type: "message",
	// 	backgroundVariant: "getStartedImage",
	// 	headline: "So what can we control?",
	// 	body: "Food has the biggest day-to-day impact on your gut health.",
	// 	centerGraphic: "foodControlIntro",
	// 	cta: "Got it",
	// },
	// "food-lever" cut: pure narrative, no data collection (see plan).
	{
		id: "tried-other-apps",
		step: 20,
		type: "single_select",
		headline: "Have you tried other gut health apps?",
		body: "This helps us understand what has or has not worked for you before.",
		cta: "Continue",
		field: "triedOtherGutHealthApps",
		options: triedGutHealthAppsOptions,
		optionIcons: {
			Yes: "thumbs-up-outline",
			No: "thumbs-down-outline",
		},
	},
	{
		id: "motivation",
		step: 21,
		type: "multi_select",
		headline: "What are your main goals?",
		body: "We use this personalize your experience.",
		cta: "Continue",
		field: "motivations",
		options: motivationOptions,
	},
	{
		id: "gut-score-analyzing",
		step: 22,
		type: "preview",
		headline: "Let's compute your starting Gut Score",
		body: "Based on your answers thus far, we are weighing your symptoms, conditions and current patterns.",
		cta: "Show my score",
		previewVariant: "scoreAnalyzing",
	},
	{
		id: "lower-score-plan",
		step: 23,
		type: "preview",
		headline: "Your body is unique",
		body: "it's our job to figure out exactly how your stomach responds to food",
		cta: "Let's commit",
		previewVariant: "lowerScorePlan",
	},
	// {
	// 	id: "reminder-framing",
	// 	step: 23,
	// 	type: "message",
	// 	backgroundVariant: "getStartedImage",
	// 	headline: "To improve over time, we may check in once a day",
	// 	body: "A quick daily report helps us learn what actually affected you, without asking you to judge every meal.",
	// 	cta: "Continue",
	// },
	{
		id: "notification-priming",
		step: 24,
		type: "message",
		backgroundVariant: "getStartedImage",
		headline: "One tap a day keeps your triggers accurate",
		body: "We'll send one evening reminder. Answer it with a single tap — Calm, Meh, or Rough — and your Gut Score and triggers stay honest.",
		cta: "Continue",
	},
	// {
	// 	id: "adaptation",
	// 	step: 25,
	// 	type: "message",
	// 	backgroundVariant: "getStartedImage",
	// 	headline: "Your Gut Score changes when your real outcomes change",
	// 	body: "Each scan starts with what you tell us now. Then your daily reports teach the app what supports or lowers your Gut Score.",
	// 	cta: "Continue",
	// },
	// {
	// 	id: "trigger-preview",
	// 	step: 26,
	// 	type: "preview",
	// 	headline: "You'll start seeing patterns like these",
	// 	body: "Tomato could emerge as a strong trigger. Garlic might show up as a growing pattern. Rice might become one of your safer foods.",
	// 	cta: "Continue",
	// 	previewVariant: "triggerPreview",
	// },
	// {
	// 	id: "safe-foods-preview",
	// 	step: 27,
	// 	type: "preview",
	// 	headline: "This isn't just about what to avoid",
	// 	body: "We'll also help you identify foods that tend to be easier on your stomach and foods that may be worth testing again later.",
	// 	cta: "Continue",
	// 	previewVariant: "safeFoodsPreview",
	// },
	// {
	// 	id: "trust-and-clarity",
	// 	step: 24,
	// 	type: "preview",
	// 	headline: "Your stomach needs its own plan",
	// 	body: "Generic gut advice can only guess. We learn which specific foods affect you.",
	// 	cta: "Let's commit",
	// 	previewVariant: "trust",
	// },
	{
		id: "commit-to-healing",
		step: 25,
		type: "preview",
		headline: "I will use MyTummyHurts to take back control of my gut",
		body: "",
		cta: "Press and hold Pip",
		previewVariant: "commitmentHold",
	},
	{
		id: "app-store-rating",
		step: 26,
		type: "preview",
		headline: "Help more people feel better",
		body: "A quick rating helps other people find gut clarity before they eat.",
		cta: "Submit rating",
		previewVariant: "appStoreReview",
	},
	{
		id: "free-trial",
		step: 27,
		type: "preview",
		headline: "We offer 7 days free so everyone can try",
		body: "",
		footerBody: "✓ no payment due now",
		cta: "Try for $0.00",
		previewVariant: "trialFreePreview",
	},
	// {
	// 	id: "summary-intro",
	// 	step: 29,
	// 	type: "preview",
	// 	headline: "Here's what will shape your starting Gut Score",
	// 	body: "Next you will see a summary of the gut profile we can build from what you told us.",
	// 	cta: "Continue",
	// 	previewVariant: "summaryIntro",
	// },
	// {
	// 	id: "personalized-summary",
	// 	step: 30,
	// 	type: "summary",
	// 	headline: "Your profile summary",
	// 	body: "This is what will shape your starting Gut Score while the app starts learning from real daily reports.",
	// 	cta: "Continue",
	// },
	// {
	// 	id: "product-recap",
	// 	step: 31,
	// 	type: "preview",
	// 	headline: "From here on out, every scan works toward a calmer gut",
	// 	body: "Personalized risk scores, Gut Score tracking, trigger detection, safe-food learning, and reintroduction guidance.",
	// 	cta: "See plans",
	// 	previewVariant: "recap",
	// },
];

const stepMascotStates: Partial<Record<string, PipState>> = {
	welcome: "waving",
	"empathy-problem": "anxious",
	"healing-promise": "joy",
	"conditions-select": "thinking",
	"ingredient-select": "thinking",
	"food-calibration": "thinking",
	"last-bad-meal": "anxious",
	"symptoms-select": "thinking",
	"frequency-select": "thinking",
	"severity-select": "thinking",
	"know-before-eat": "thinking",
	"personalized-promise": "love",
	"gut-score-intro": "love",
	"daily-score-intro": "subtle",
	"simple-plan": "thumbsUp",
	"phase-discovery": "thinking",
	"phase-limitation": "subtle",
	"phase-reintroduction": "joy",
	"scanner-modes": "subtle",
	"issues-rising": "anxious",
	"food-control-intro": "subtle",
	"food-lever": "thumbsUp",
	"tried-other-apps": "thinking",
	motivation: "thinking",
	"gut-score-analyzing": "thinking",
	"lower-score-plan": "love",
	"notification-priming": "thumbsUp",
	"trust-and-clarity": "thinking",
	"commit-to-healing": "love",
	"app-store-rating": "love",
	"free-trial": "thumbsUp",
	"summary-intro": "thumbsUp",
	"personalized-summary": "love",
	"product-recap": "joy",
};

export function getMascotStateForStep(stepId: string): PipState {
	return stepMascotStates[stepId] ?? "subtle";
}

import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Text, View } from "react-native";

import { Gauge } from "../../components/charts/Gauge";
import { RiskBar } from "../../components/charts/RiskBar";
import {
	DetailRow,
	Divider,
	InfoPill,
	InputField,
	MetricPill,
	OnboardingPickerOption,
	SectionCard,
} from "../../components/common/UI";
import {
	calibrationFoodOptions,
	dietPreferenceKeyFromLabel,
	dietPreferenceLabelFromKey,
	noSpecificDietOption,
} from "../../data/catalog";
import { OnboardingAnswers, OnboardingStepDefinition } from "../../types/domain";
import { StartingGutScoreComputeCard, type StartingScoreState } from "./components/StartingGutScoreComputeCard";
import { RaiseGutScorePlanPreview } from "./components/RaiseGutScorePlanPreview";
import { CalibrationDeck } from "./components/CalibrationDeck";
import { CommitmentHoldCard } from "./components/CommitmentHoldCard";
import { KnowBeforeEatDemo, type KnowBeforeEatStage } from "./components/KnowBeforeEatDemo";
import { PersonalHealingApproach } from "./components/PersonalHealingApproach";
import { TrialFreePreview } from "./components/TrialFreePreview";
import { AppStoreRatingPreview } from "./components/AppStoreRatingPreview";
import {
	INGREDIENT_SENSITIVITY_UNKNOWN_OPTION,
	STAGGER_BASE_MS,
	STAGGER_STEP_MS,
	StaggerItem,
	optionDelayMs,
} from "./OnboardingFlowScreen.helpers";
import { styles } from "./OnboardingFlowScreen.styles";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type ToggleOnboardingField =
	| "conditions"
	| "ingredientSensitivities"
	| "symptoms"
	| "mealContexts"
	| "motivations"
	| "currentEatingPatterns"
	| "lifestyleFactors"
	| "dietPreferenceKeys";

type CustomOnboardingField =
	| "customConditions"
	| "customIngredientSensitivities"
	| "customSymptoms";

interface OnboardingPreviewProps {
	step: OnboardingStepDefinition;
	answers: OnboardingAnswers;
	currentEatingPatterns: string[];
	lifestyleFactors: string[];
	knowBeforeEatStage: KnowBeforeEatStage;
	centerImageHeight: number;
	reviewPromptBusy: boolean;
	startingScore: number;
	startingScoreState: StartingScoreState;
	onAdvance: () => void;
	onSkipReview: () => void;
}

export function OnboardingPreview({
	step,
	answers,
	currentEatingPatterns,
	lifestyleFactors,
	knowBeforeEatStage,
	centerImageHeight,
	reviewPromptBusy,
	startingScore,
	startingScoreState,
	onAdvance,
	onSkipReview,
}: OnboardingPreviewProps) {
	switch (step.previewVariant) {
		case "howItWorks":
			return (
				<View style={styles.previewStack}>
					{[
						"Scan food",
						"Check Gut Score impact",
						"Log daily reports",
						"Improve Gut Score",
					].map((entry, index) => (
						<SectionCard key={entry} style={styles.previewCard}>
							<InfoPill label={`Step ${index + 1}`} tone="soft" />
							<Text style={styles.previewTitle}>{entry}</Text>
						</SectionCard>
					))}
				</View>
			);
		case "resultPreview":
			return (
				<SectionCard>
					<Gauge score={72} label="high" />
					<Text style={styles.previewBody}>
						This meal may lower your Gut Score by 5 points.
					</Text>
					<RiskBar label="GERD" score={81} level="high" />
					<RiskBar label="IBS" score={56} level="medium" />
					<DetailRow label="Possible triggers" value="Tomato, garlic" />
				</SectionCard>
			);
		case "triggerPreview":
			return (
				<View style={styles.previewStack}>
					{[
						{ name: "Tomato", value: "Strong pattern" },
						{ name: "Garlic", value: "Growing pattern" },
						{ name: "Dairy", value: "Early watch-out" },
					].map((entry) => (
						<SectionCard key={entry.name} style={styles.previewCard}>
							<Text style={styles.previewTitle}>{entry.name}</Text>
							<Text style={styles.previewNote}>{entry.value}</Text>
						</SectionCard>
					))}
				</View>
			);
		case "safeFoodsPreview":
			return (
				<View style={styles.previewStack}>
					{["Rice", "Salmon", "Oats"].map((entry) => (
						<SectionCard key={entry} style={styles.previewCard}>
							<Text style={styles.previewTitle}>{entry}</Text>
							<Text style={styles.previewNote}>
								Trending gentler for your stomach
							</Text>
						</SectionCard>
					))}
				</View>
			);
		case "knowBeforeEat":
			return (
				<KnowBeforeEatDemo
					stage={knowBeforeEatStage}
					imageHeight={centerImageHeight}
				/>
			);
		case "trust":
			return <PersonalHealingApproach />;
		case "commitmentHold":
			return <CommitmentHoldCard onCommitted={onAdvance} />;
		case "appStoreReview":
			return (
				<AppStoreRatingPreview
					busy={reviewPromptBusy}
					onSkip={onSkipReview}
				/>
			);
		case "trialFreePreview":
			return <TrialFreePreview />;
		case "summaryIntro":
			return (
				<SectionCard>
					<MetricPill
						label="Conditions"
						value={String(
							answers.conditions.length + answers.customConditions.length || 0
						)}
					/>
					<MetricPill
						label="Known triggers"
						value={String(
							answers.ingredientSensitivities.length +
								answers.customIngredientSensitivities.length || 0
						)}
					/>
					<MetricPill
						label="Gut context"
						value={String(
							currentEatingPatterns.length + lifestyleFactors.length || 0
						)}
					/>
				</SectionCard>
			);
		case "scoreAnalyzing":
			return (
				<StartingGutScoreComputeCard
					score={startingScore}
					state={startingScoreState}
				/>
			);
		case "lowerScorePlan":
			return <RaiseGutScorePlanPreview currentScore={startingScore} />;
		case "recap":
			return (
				<View style={styles.metricRow}>
					<MetricPill label="Gut Score" value="Higher is better" />
					<MetricPill label="History" value="Scan-led" />
					<MetricPill label="Insights" value="Adaptive" />
				</View>
			);
		default:
			return null;
	}
}

interface OnboardingSummaryProps {
	answers: OnboardingAnswers;
	currentEatingPatterns: string[];
	lifestyleFactors: string[];
	favoriteFoodsToReintroduce: string;
}

export function OnboardingSummary({
	answers,
	currentEatingPatterns,
	lifestyleFactors,
	favoriteFoodsToReintroduce,
}: OnboardingSummaryProps) {
	const conditionSummary =
		answers.conditions.length + answers.customConditions.length > 0
			? [...answers.conditions, ...answers.customConditions].join(", ")
			: "General digestive triggers until your scans teach us more.";

	const triggerSummary =
		answers.ingredientSensitivities.length + answers.customIngredientSensitivities.length >
		0
			? [
					...answers.ingredientSensitivities,
					...answers.customIngredientSensitivities,
			  ].join(", ")
			: "No declared ingredient triggers yet. The app will learn from daily reports.";

	return (
		<SectionCard>
			<DetailRow label="Conditions we will score for" value={conditionSummary} />
			<Divider />
			<DetailRow label="Known trigger ingredients" value={triggerSummary} />
			<Divider />
			<DetailRow
				label="What daily reports will track"
				value={
					[...answers.symptoms, ...(answers.customSymptoms ?? [])].length
						? [...answers.symptoms, ...(answers.customSymptoms ?? [])].join(", ")
						: "Bloating, pain, reflux, and general symptom patterns"
				}
			/>
			<Divider />
			<DetailRow
				label="Where you most need clarity"
				value={
					answers.mealContexts.length
						? answers.mealContexts.join(", ")
						: "Restaurants, takeout, and uncertain ingredient mixes"
				}
			/>
			<Divider />
			<DetailRow
				label="Current gut context"
				value={
					[...currentEatingPatterns, ...lifestyleFactors].length
						? [...currentEatingPatterns, ...lifestyleFactors].join(", ")
						: "No extra lifestyle context added."
				}
			/>
			<Divider />
			<DetailRow
				label="Diet goal"
				value={
					answers.dietPreferenceKeys.length
						? answers.dietPreferenceKeys.map(dietPreferenceLabelFromKey).join(", ")
						: "No specific diet, just help me feel better."
				}
			/>
			<Divider />
			<DetailRow
				label="Foods to earn back"
				value={
					favoriteFoodsToReintroduce.trim() || "No reintroduction foods added yet."
				}
			/>
		</SectionCard>
	);
}

interface OnboardingSelectionControlsProps {
	step: OnboardingStepDefinition;
	answers: OnboardingAnswers;
	hasImageBackground: boolean;
	customField: CustomOnboardingField | null;
	currentEatingPatterns: string[];
	lifestyleFactors: string[];
	favoriteFoodsToReintroduce: string;
	knowBeforeEatStage: KnowBeforeEatStage;
	centerImageHeight: number;
	reviewPromptBusy: boolean;
	startingScore: number;
	startingScoreState: StartingScoreState;
	onUpdateField: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void;
	onToggleValue: (field: ToggleOnboardingField, value: string) => void;
	onOpenCustomModal: () => void;
	onAdvance: () => void;
	onSkipReview: () => void;
}

export function OnboardingSelectionControls({
	step,
	answers,
	hasImageBackground,
	customField,
	currentEatingPatterns,
	lifestyleFactors,
	favoriteFoodsToReintroduce,
	knowBeforeEatStage,
	centerImageHeight,
	reviewPromptBusy,
	startingScore,
	startingScoreState,
	onUpdateField,
	onToggleValue,
	onOpenCustomModal,
	onAdvance,
	onSkipReview,
}: OnboardingSelectionControlsProps) {
	const pickerVariant = hasImageBackground ? "image" : "plain";

	if (step.type === "multi_select" && step.field && step.options) {
		const values = answers[step.field];
		const customCount = customField ? (answers[customField] ?? []).length : 0;
		const isIngredientSensitivityStep = step.field === "ingredientSensitivities";
		const isDietPreferenceStep = step.field === "dietPreferenceKeys";

		function handleMultiSelectOptionPress(option: string) {
			if (isDietPreferenceStep) {
				if (option === noSpecificDietOption) {
					onUpdateField("dietPreferenceNone", true);
					onUpdateField("dietPreferenceKeys", []);
					return;
				}

				const dietKey = dietPreferenceKeyFromLabel(option);
				if (!dietKey) {
					return;
				}

				onUpdateField("dietPreferenceNone", false);
				onToggleValue("dietPreferenceKeys", dietKey);
				return;
			}

			if (isIngredientSensitivityStep) {
				onUpdateField("ingredientSensitivitiesUnknown", false);
			}

			onToggleValue(
				step.field as
					| "conditions"
					| "ingredientSensitivities"
					| "symptoms"
					| "mealContexts"
					| "motivations"
					| "currentEatingPatterns"
					| "lifestyleFactors"
					| "dietPreferenceKeys",
				option
			);
		}

		function handleCustomOptionPress() {
			if (isIngredientSensitivityStep) {
				onUpdateField("ingredientSensitivitiesUnknown", false);
			}

			onOpenCustomModal();
		}

		function handleIngredientSensitivityUnknownPress() {
			onUpdateField("ingredientSensitivitiesUnknown", true);
			onUpdateField("ingredientSensitivities", []);
			onUpdateField("customIngredientSensitivities", []);
		}

		return (
			<View style={styles.optionGrid}>
				{step.options.map((option, index) => (
					<StaggerItem key={option} delayMs={optionDelayMs(index)}>
						<OnboardingPickerOption
							label={option}
							iconName={step.optionIcons?.[option] as IoniconName | undefined}
							variant={pickerVariant}
							selected={
								isDietPreferenceStep
									? option === noSpecificDietOption
										? Boolean(answers.dietPreferenceNone)
										: Boolean(
												dietPreferenceKeyFromLabel(option) &&
													answers.dietPreferenceKeys.includes(
														dietPreferenceKeyFromLabel(option)!
													)
										  )
										: Array.isArray(values)
										? (values as string[]).includes(option)
									: values === option
							}
							onPress={() => handleMultiSelectOptionPress(option)}
						/>
					</StaggerItem>
				))}
				{step.allowCustom ? (
					<StaggerItem delayMs={optionDelayMs(step.options.length)}>
						<OnboardingPickerOption
							label="Other"
							variant={pickerVariant}
							badgeText={customCount > 0 ? `+${customCount}` : undefined}
							selected={false}
							onPress={handleCustomOptionPress}
						/>
					</StaggerItem>
				) : null}
				{isIngredientSensitivityStep ? (
					<StaggerItem
						delayMs={optionDelayMs(
							step.options.length + (step.allowCustom ? 1 : 0)
						)}
					>
						<OnboardingPickerOption
							label={INGREDIENT_SENSITIVITY_UNKNOWN_OPTION}
							variant={pickerVariant}
							selected={Boolean(answers.ingredientSensitivitiesUnknown)}
							onPress={handleIngredientSensitivityUnknownPress}
						/>
					</StaggerItem>
				) : null}
			</View>
		);
	}

	if (step.type === "single_select" && step.field && step.options) {
		const value = answers[step.field];
		return (
			<View style={styles.optionGrid}>
				{step.options.map((option, index) => (
					<StaggerItem key={option} delayMs={optionDelayMs(index)}>
						<OnboardingPickerOption
							label={option}
							iconName={step.optionIcons?.[option] as IoniconName | undefined}
							variant={pickerVariant}
							selected={value === option}
							onPress={() =>
								onUpdateField(
									step.field as
										| "symptomFrequency"
										| "symptomSeverityBaseline"
										| "triedOtherGutHealthApps"
										| "motivation",
									option
								)
							}
						/>
					</StaggerItem>
				))}
			</View>
		);
	}

	const blockDelay = STAGGER_BASE_MS + STAGGER_STEP_MS * 2;

	if (step.type === "calibration") {
		return (
			<CalibrationDeck
				foods={calibrationFoodOptions}
				ratings={answers.foodCalibrations}
				onRate={(food, rating) => {
					const next = { ...answers.foodCalibrations };
					if (rating === null) {
						delete next[food];
					} else {
						next[food] = rating;
					}
					onUpdateField("foodCalibrations", next);
				}}
			/>
		);
	}

	if (
		step.type === "text_input" &&
		(step.field === "displayName" ||
			step.field === "favoriteFoodsToReintroduce" ||
			step.field === "lastBadMealText")
	) {
		const value =
			step.field === "displayName"
				? answers.displayName
				: step.field === "lastBadMealText"
				? answers.lastBadMealText
				: favoriteFoodsToReintroduce;
		return (
			<StaggerItem delayMs={blockDelay}>
				<SectionCard>
					<InputField
						value={value}
						multiline={step.field === "lastBadMealText"}
						placeholder={
							step.field === "displayName"
								? "Enter a display name"
								: step.field === "lastBadMealText"
								? "Chicken alfredo with garlic bread, glass of red wine..."
								: "pizza, coffee, pasta"
						}
						onChangeText={(nextValue) =>
							onUpdateField(
								step.field as
									| "displayName"
									| "favoriteFoodsToReintroduce"
									| "lastBadMealText",
								nextValue
							)
						}
					/>
					{step.helper ? <Text style={styles.previewNote}>{step.helper}</Text> : null}
				</SectionCard>
			</StaggerItem>
		);
	}

	if (step.type === "summary") {
		return (
			<StaggerItem delayMs={blockDelay}>
				<OnboardingSummary
					answers={answers}
					currentEatingPatterns={currentEatingPatterns}
					lifestyleFactors={lifestyleFactors}
					favoriteFoodsToReintroduce={favoriteFoodsToReintroduce}
				/>
			</StaggerItem>
		);
	}

	if (step.type === "preview") {
		return (
			<StaggerItem delayMs={blockDelay}>
				<OnboardingPreview
					step={step}
					answers={answers}
					currentEatingPatterns={currentEatingPatterns}
					lifestyleFactors={lifestyleFactors}
					knowBeforeEatStage={knowBeforeEatStage}
					centerImageHeight={centerImageHeight}
					reviewPromptBusy={reviewPromptBusy}
					startingScore={startingScore}
					startingScoreState={startingScoreState}
					onAdvance={onAdvance}
					onSkipReview={onSkipReview}
				/>
			</StaggerItem>
		);
	}

	return null;
}

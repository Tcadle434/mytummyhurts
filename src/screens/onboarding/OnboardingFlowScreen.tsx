import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import * as StoreReview from "expo-store-review";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Image,
	Platform,
	Pressable,
	ScrollView,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

import {
	AppScreen,
	InfoPill,
	PrimaryButton,
	ScreenHeader,
} from "../../components/common/UI";
import { CustomEntryModal } from "../../components/modals/CustomEntryModal";
import { getMascotStateForStep, normalizeOnboardingAnswers, onboardingSteps } from "../../data/onboarding";
import { trackEvent } from "../../services/analytics";
import { computeGutScoreState } from "../../services/ai/scoring";
import { useAppStore } from "../../store/useAppStore";
import { palette, tokens } from "../../theme";
import { withAlpha } from "../../theme/helpers";
import { OnboardingStackParamList } from "../../navigation/types";
import { type StartingScoreState } from "./components/StartingGutScoreComputeCard";
import { WelcomeFoodScene } from "./components/WelcomeFoodScene";
import { type PhaseDiscoveryState } from "./components/PhaseDiscoveryGraphic";
import { OnboardingCenterGraphic } from "./components/OnboardingCenterGraphic";
import { OnboardingPipCompanion } from "./components/OnboardingPipCompanion";
import { OnboardingProgressBar } from "./components/OnboardingProgressBar";
import { type KnowBeforeEatStage } from "./components/KnowBeforeEatDemo";
import { StepTransition, StepTransitionDirection } from "./components/StepTransition";
import { OnboardingSelectionControls } from "./OnboardingFlowParts";
import {
	STAGGER_BASE_MS,
	STAGGER_STEP_MS,
	StaggerItem,
} from "./OnboardingFlowScreen.helpers";
import { styles } from "./OnboardingFlowScreen.styles";

type Props = NativeStackScreenProps<OnboardingStackParamList, "OnboardingFlow">;

const GET_STARTED_BACKGROUND_IMAGE = require("../../../assets/get_started_background_image.png");
const GUT_ISSUES_DIAGRAM = require("../../../assets/ui/gut_issues_diagram.png");

export function OnboardingFlowScreen({ navigation }: Props) {
	const stepIndex = useAppStore((state) => state.onboardingStepIndex);
	const persistedAnswers = useAppStore((state) => state.onboardingAnswers);
	const answers = useMemo(() => normalizeOnboardingAnswers(persistedAnswers), [persistedAnswers]);
	const setStepIndex = useAppStore((state) => state.setOnboardingStepIndex);
	const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
	const updateField = useAppStore((state) => state.updateOnboardingField);
	const toggleValue = useAppStore((state) => state.toggleOnboardingValue);
	const addCustomValue = useAppStore((state) => state.addCustomOnboardingValue);
	const removeCustomValue = useAppStore((state) => state.removeCustomOnboardingValue);
	const [customEntry, setCustomEntry] = useState("");
	const [customOptionModalVisible, setCustomOptionModalVisible] = useState(false);
	const [phaseDiscoveryState, setPhaseDiscoveryState] = useState<PhaseDiscoveryState>("scan");
	const [startingScoreState, setStartingScoreState] = useState<StartingScoreState>("ready");
	const [knowBeforeEatStage, setKnowBeforeEatStage] = useState<KnowBeforeEatStage>("menu-scan");
	const [reviewPromptBusy, setReviewPromptBusy] = useState(false);
	const [direction, setDirection] = useState<StepTransitionDirection>("forward");
	const phaseDiscoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startingScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const knowBeforeEatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();

	const step = onboardingSteps[Math.min(stepIndex, onboardingSteps.length - 1)]!;
	const stepCount = onboardingSteps.length;
	const stepNumber = stepIndex + 1;
	const currentEatingPatterns = answers.currentEatingPatterns ?? [];
	const lifestyleFactors = answers.lifestyleFactors ?? [];
	const favoriteFoodsToReintroduce = answers.favoriteFoodsToReintroduce ?? "";
	const startingGutScore = useMemo(
		() =>
			computeGutScoreState({
				answers,
				insights: [],
				scans: [],
				dailyReports: [],
			}),
		[answers]
	);

	useEffect(() => {
		trackEvent("onboarding_step_viewed", { step_id: step.id, step_number: stepNumber });
	}, [step.id, stepNumber]);

	useEffect(() => {
		clearPhaseDiscoveryTimeout();
		clearStartingScoreTimeout();
		clearKnowBeforeEatTimeout();
		if (step.id === "phase-discovery") {
			setPhaseDiscoveryState("scan");
		}
		if (step.id === "gut-score-analyzing") {
			setStartingScoreState("ready");
		}
		if (step.id === "know-before-eat") {
			setKnowBeforeEatStage("menu-scan");
		}
	}, [step.id]);

	useEffect(() => {
		return () => {
			clearPhaseDiscoveryTimeout();
			clearStartingScoreTimeout();
			clearKnowBeforeEatTimeout();
		};
	}, []);

	const progress = (stepIndex + 1) / stepCount;
	const hasImageBackground = step.backgroundVariant === "getStartedImage";
	const backIconColor = hasImageBackground ? tokens.color.utility.white : palette.primary;
	const titleColor = hasImageBackground ? tokens.color.utility.white : palette.primary;
	const subtitleColor = hasImageBackground
		? withAlpha(tokens.color.utility.white, 0.86)
		: undefined;
	const centerImageSource = getCenterImageSource(step.centerImage);
	const centerImageHeight = Math.min(Math.max(windowHeight * 0.39, 290), 370);
	const centerImageWidth = centerImageHeight * (1024 / 1535);
	const isPhaseDiscoveryStep = step.id === "phase-discovery";
	const isStartingScoreStep = step.id === "gut-score-analyzing";
	const isKnowBeforeEatStep = step.id === "know-before-eat";
	const isAppStoreRatingStep = step.previewVariant === "appStoreReview";
	const isKnowBeforeEatLoading =
		isKnowBeforeEatStep &&
		(knowBeforeEatStage === "menu-loading" ||
			knowBeforeEatStage === "food-loading" ||
			knowBeforeEatStage === "barcode-loading");
	const isCommitmentStep = step.previewVariant === "commitmentHold";
	const isChoiceStep = step.type === "multi_select" || step.type === "single_select";
	const hasRequiredAnswer = currentStepHasRequiredAnswer();
	const mascotState = getMascotStateForStep(step.id);
	const headerTitle =
		isStartingScoreStep && startingScoreState === "revealed"
			? "Your starting Gut Score is ready"
			: step.headline;
	const headerSubtitle =
		isStartingScoreStep && startingScoreState === "revealed"
			? "This is just a starting point from your current profile."
			: step.body;
	const ctaLabel = isPhaseDiscoveryStep
		? phaseDiscoveryState === "result"
			? "Next phase"
			: phaseDiscoveryState === "loading"
			? "Analyzing..."
			: "Analyze risk"
		: isStartingScoreStep
		? startingScoreState === "revealed"
			? "How do we raise it?"
			: startingScoreState === "loading"
			? "Computing..."
			: "Show my score"
		: isKnowBeforeEatStep
		? knowBeforeEatCtaLabel(knowBeforeEatStage)
		: isAppStoreRatingStep
		? reviewPromptBusy
			? "Opening..."
			: step.cta
		: step.cta;
	const ctaDisabled =
		(isPhaseDiscoveryStep && phaseDiscoveryState === "loading") ||
		(isStartingScoreStep && startingScoreState === "loading") ||
		isKnowBeforeEatLoading ||
		reviewPromptBusy ||
		!hasRequiredAnswer;

	function clearPhaseDiscoveryTimeout() {
		if (phaseDiscoveryTimeoutRef.current) {
			clearTimeout(phaseDiscoveryTimeoutRef.current);
			phaseDiscoveryTimeoutRef.current = null;
		}
	}

	function clearStartingScoreTimeout() {
		if (startingScoreTimeoutRef.current) {
			clearTimeout(startingScoreTimeoutRef.current);
			startingScoreTimeoutRef.current = null;
		}
	}

	function clearKnowBeforeEatTimeout() {
		if (knowBeforeEatTimeoutRef.current) {
			clearTimeout(knowBeforeEatTimeoutRef.current);
			knowBeforeEatTimeoutRef.current = null;
		}
	}

	function advanceStep() {
		trackEvent("onboarding_step_completed", { step_id: step.id, step_number: stepNumber });
		if (stepIndex >= onboardingSteps.length - 1) {
			navigation.replace("OnboardingPaywall");
			return;
		}
		setDirection("forward");
		setStepIndex(stepIndex + 1);
	}

	function handleContinue() {
		if (ctaDisabled) {
			return;
		}

		void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

		if (isPhaseDiscoveryStep && phaseDiscoveryState === "scan") {
			trackEvent("onboarding_phase_discovery_analyze_tapped");
			clearPhaseDiscoveryTimeout();
			setPhaseDiscoveryState("loading");
			phaseDiscoveryTimeoutRef.current = setTimeout(() => {
				setPhaseDiscoveryState("result");
				phaseDiscoveryTimeoutRef.current = null;
			}, 900);
			return;
		}

		if (isPhaseDiscoveryStep && phaseDiscoveryState === "loading") {
			return;
		}

		if (isStartingScoreStep && startingScoreState === "ready") {
			trackEvent("onboarding_starting_gut_score_compute_tapped");
			clearStartingScoreTimeout();
			setStartingScoreState("loading");
			startingScoreTimeoutRef.current = setTimeout(() => {
				setStartingScoreState("revealed");
				startingScoreTimeoutRef.current = null;
			}, 2200);
			return;
		}

		if (isStartingScoreStep && startingScoreState === "loading") {
			return;
		}

		if (isKnowBeforeEatStep) {
			const nextStage = nextKnowBeforeEatStageOnTap(knowBeforeEatStage);
			if (nextStage === "advance") {
				advanceStep();
				return;
			}
			if (nextStage === null) {
				return;
			}
			setKnowBeforeEatStage(nextStage);
			if (nextStage.endsWith("-loading")) {
				const resultStage: KnowBeforeEatStage =
					nextStage === "menu-loading"
						? "menu-result"
						: nextStage === "food-loading"
						? "food-result"
						: "barcode-result";
				clearKnowBeforeEatTimeout();
				knowBeforeEatTimeoutRef.current = setTimeout(() => {
					setKnowBeforeEatStage(resultStage);
					knowBeforeEatTimeoutRef.current = null;
				}, 1500);
			}
			return;
		}

		if (isAppStoreRatingStep) {
			void requestNativeAppStoreReview();
			return;
		}

		advanceStep();
	}

	async function requestNativeAppStoreReview() {
		if (reviewPromptBusy) {
			return;
		}

		setReviewPromptBusy(true);
		trackEvent("onboarding_app_store_review_submit_tapped", {
			platform: Platform.OS,
		});

		try {
			const [available, hasAction] = await Promise.all([
				StoreReview.isAvailableAsync(),
				StoreReview.hasAction(),
			]);

			if (available && hasAction) {
				await StoreReview.requestReview();
				trackEvent("onboarding_app_store_review_requested", {
					platform: Platform.OS,
				});
			} else {
				trackEvent("onboarding_app_store_review_unavailable", {
					platform: Platform.OS,
					available,
					has_action: hasAction,
				});
			}
		} catch (error) {
			trackEvent("onboarding_app_store_review_failed", {
				platform: Platform.OS,
				message: error instanceof Error ? error.message : "unknown_error",
			});
		} finally {
			setReviewPromptBusy(false);
			advanceStep();
		}
	}

	function skipNativeAppStoreReview() {
		if (reviewPromptBusy) {
			return;
		}

		void Haptics.selectionAsync();
		trackEvent("onboarding_app_store_review_skipped", {
			platform: Platform.OS,
		});
		advanceStep();
	}

	function handleBack() {
		void Haptics.selectionAsync();

		if (isStartingScoreStep && startingScoreState !== "ready") {
			clearStartingScoreTimeout();
			setStartingScoreState("ready");
			return;
		}

		if (isPhaseDiscoveryStep && phaseDiscoveryState !== "scan") {
			clearPhaseDiscoveryTimeout();
			setPhaseDiscoveryState("scan");
			return;
		}

		if (isKnowBeforeEatStep && knowBeforeEatStage !== "menu-scan") {
			clearKnowBeforeEatTimeout();
			setKnowBeforeEatStage(previousKnowBeforeEatStage(knowBeforeEatStage));
			return;
		}

		if (stepIndex <= 0) {
			setOnboardingStage("intro");
			navigation.replace("GetStarted");
			return;
		}

		setDirection("backward");
		setStepIndex(stepIndex - 1);
	}

	function currentStepHasRequiredAnswer() {
		if (step.type === "single_select" && step.field) {
			const value = answers[step.field];
			return Array.isArray(value) ? value.length > 0 : Boolean(value);
		}

		if (step.type === "multi_select" && step.field) {
			if (step.field === "dietPreferenceKeys") {
				return Boolean(answers.dietPreferenceNone) || (answers.dietPreferenceKeys ?? []).length > 0;
			}

			if (
				step.field === "ingredientSensitivities" &&
				answers.ingredientSensitivitiesUnknown
			) {
				return true;
			}

			const value = answers[step.field];
			const customField = customFieldForCurrentStep();
			const customValues = customField ? answers[customField] ?? [] : [];
			return (Array.isArray(value) && value.length > 0) || customValues.length > 0;
		}

		return true;
	}

	function customFieldForCurrentStep() {
		if (step.field === "conditions") return "customConditions" as const;
		if (step.field === "ingredientSensitivities") {
			return "customIngredientSensitivities" as const;
		}
		if (step.field === "symptoms") return "customSymptoms" as const;
		return null;
	}

	function getCustomOptionCopy() {
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

	function closeCustomOptionModal() {
		setCustomOptionModalVisible(false);
		setCustomEntry("");
	}

	function submitCustomOption() {
		const field = customFieldForCurrentStep();
		if (!field || !customEntry.trim()) {
			return;
		}

		if (field === "customIngredientSensitivities") {
			updateField("ingredientSensitivitiesUnknown", false);
		}

		addCustomValue(field, customEntry);
		setCustomEntry("");
	}

	function removeCustomOption(value: string) {
		const field = customFieldForCurrentStep();
		if (!field) {
			return;
		}

		removeCustomValue(field, value);
	}

	const customOptionField = customFieldForCurrentStep();
	const customOptionValues = customOptionField ? answers[customOptionField] ?? [] : [];
	const customOptionCopy = getCustomOptionCopy();

	return (
		<AppScreen
			scroll={false}
			background={renderOnboardingBackground(
				step.backgroundVariant,
				windowWidth,
				windowHeight
			)}
			contentContainerStyle={styles.onboardingContent}
		>
			<View style={styles.topBar}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Back"
					onPress={handleBack}
					hitSlop={8}
					style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="chevron-back" size={26} color={backIconColor} />
				</Pressable>
				<OnboardingProgressBar progress={progress} />
				<OnboardingPipCompanion state={mascotState} />
			</View>

			<StepTransition
				stepKey={step.id}
				direction={direction}
				style={isChoiceStep ? styles.choiceStepShell : null}
			>
				<ScrollView
					showsVerticalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					style={styles.stepScroll}
					contentContainerStyle={[
						styles.stepScrollContent,
						isChoiceStep ? styles.choiceStepScrollContent : null,
					]}
				>
					{step.id === "welcome" ? (
						<StaggerItem delayMs={0}>
							<WelcomeFoodScene />
						</StaggerItem>
					) : null}

					<StaggerItem delayMs={STAGGER_BASE_MS}>
						<ScreenHeader
							title={headerTitle}
							subtitle={headerSubtitle}
							titleColor={titleColor}
							titleStyle={hasImageBackground ? styles.imageBackgroundTitle : null}
							subtitleColor={subtitleColor}
							fullWidth
						/>
					</StaggerItem>

					{step.helper ? (
						<StaggerItem delayMs={STAGGER_BASE_MS + STAGGER_STEP_MS}>
							<InfoPill label={step.helper} tone="soft" />
						</StaggerItem>
					) : null}

					<OnboardingSelectionControls
						step={step}
						answers={answers}
						hasImageBackground={hasImageBackground}
						customField={customFieldForCurrentStep()}
						currentEatingPatterns={currentEatingPatterns}
						lifestyleFactors={lifestyleFactors}
						favoriteFoodsToReintroduce={favoriteFoodsToReintroduce}
						knowBeforeEatStage={knowBeforeEatStage}
						centerImageHeight={centerImageHeight}
						reviewPromptBusy={reviewPromptBusy}
						startingScore={startingGutScore.currentScore}
						startingScoreState={startingScoreState}
						onUpdateField={updateField}
						onToggleValue={toggleValue}
						onOpenCustomModal={() => setCustomOptionModalVisible(true)}
						onAdvance={advanceStep}
						onSkipReview={skipNativeAppStoreReview}
					/>

					{centerImageSource ? (
						<StaggerItem
							delayMs={STAGGER_BASE_MS + STAGGER_STEP_MS * 3}
							style={styles.centerImageSlot}
						>
							<Image
								source={centerImageSource}
								style={[
									styles.centerImage,
									{ width: centerImageWidth, height: centerImageHeight },
								]}
								resizeMode="contain"
								accessibilityIgnoresInvertColors
							/>
						</StaggerItem>
					) : null}

					{step.centerGraphic ? (
						<StaggerItem
							delayMs={STAGGER_BASE_MS + STAGGER_STEP_MS * 3}
							style={styles.centerGraphicSlot}
						>
							<OnboardingCenterGraphic
								centerGraphic={step.centerGraphic}
								phaseDiscoveryState={phaseDiscoveryState}
							/>
						</StaggerItem>
					) : null}
				</ScrollView>

				{isCommitmentStep ? null : (
					<StaggerItem
						delayMs={STAGGER_BASE_MS + STAGGER_STEP_MS * 4}
						style={[styles.footer, isChoiceStep ? styles.choiceFooter : null]}
					>
						{step.footerBody ? (
							<Text
								style={[
									styles.footerBody,
									hasImageBackground ? styles.footerBodyOnImage : null,
									step.id === "free-trial" ? styles.trialFooterBody : null,
								]}
							>
								{step.footerBody}
							</Text>
						) : null}
						<PrimaryButton
							label={ctaLabel}
							onPress={handleContinue}
							disabled={ctaDisabled}
						/>
					</StaggerItem>
				)}
			</StepTransition>

			<CustomEntryModal
				visible={customOptionModalVisible}
				title={customOptionCopy.title}
				subtitle={customOptionCopy.subtitle}
				placeholder={customOptionCopy.placeholder}
				value={customEntry}
				onChangeText={setCustomEntry}
				onSubmit={submitCustomOption}
				onClose={closeCustomOptionModal}
				values={customOptionValues}
				onRemove={removeCustomOption}
			/>
		</AppScreen>
	);
}

function renderOnboardingBackground(
	backgroundVariant: "plain" | "getStartedImage" | undefined,
	windowWidth: number,
	windowHeight: number
) {
	if (backgroundVariant !== "getStartedImage") {
		return null;
	}

	const imageAspectRatio = 720 / 1280;
	const screenAspectRatio = windowWidth / windowHeight;
	const imageHeight =
		screenAspectRatio > imageAspectRatio ? windowWidth / imageAspectRatio : windowHeight;
	const imageWidth =
		screenAspectRatio > imageAspectRatio ? windowWidth : windowHeight * imageAspectRatio;

	return (
		<View pointerEvents="none" style={styles.backgroundLayer}>
			<Image
				source={GET_STARTED_BACKGROUND_IMAGE}
				style={[styles.backgroundImage, { width: imageWidth, height: imageHeight }]}
				resizeMode="cover"
				blurRadius={8}
				accessibilityIgnoresInvertColors
			/>
			<View style={styles.backgroundWash} />
		</View>
	);
}

function getCenterImageSource(centerImage: string | undefined) {
	if (centerImage === "gutIssuesDiagram") {
		return GUT_ISSUES_DIAGRAM;
	}

	return null;
}

function knowBeforeEatCtaLabel(stage: KnowBeforeEatStage) {
	switch (stage) {
		case "menu-scan":
		case "food-scan":
		case "barcode-scan":
			return "Scan";
		case "menu-loading":
		case "food-loading":
		case "barcode-loading":
			return "Analyzing...";
		case "menu-result":
			return "Scan food";
		case "food-result":
			return "Scan grocery item";
		case "barcode-result":
			return "Show me my Gut Score";
	}
}

function nextKnowBeforeEatStageOnTap(
	stage: KnowBeforeEatStage
): KnowBeforeEatStage | "advance" | null {
	switch (stage) {
		case "menu-scan":
			return "menu-loading";
		case "menu-result":
			return "food-scan";
		case "food-scan":
			return "food-loading";
		case "food-result":
			return "barcode-scan";
		case "barcode-scan":
			return "barcode-loading";
		case "barcode-result":
			return "advance";
		default:
			return null;
	}
}

function previousKnowBeforeEatStage(stage: KnowBeforeEatStage): KnowBeforeEatStage {
	switch (stage) {
		case "menu-loading":
		case "menu-result":
			return "menu-scan";
		case "food-scan":
			return "menu-result";
		case "food-loading":
		case "food-result":
			return "food-scan";
		case "barcode-scan":
			return "food-result";
		case "barcode-loading":
		case "barcode-result":
			return "barcode-scan";
		case "menu-scan":
		default:
			return "menu-scan";
	}
}

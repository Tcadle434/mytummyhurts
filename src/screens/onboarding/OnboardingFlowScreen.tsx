import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
	BlurMask,
	Canvas,
	Circle as SkiaCircle,
	Path as SkiaPath,
} from "@shopify/react-native-skia";
import { ComponentProps, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Animated, {
	Easing,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import {
	ActivityIndicator,
	Image,
	ImageSourcePropType,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleProp,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
	ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Gauge } from "../../components/charts/Gauge";
import { RiskBar } from "../../components/charts/RiskBar";
import {
	AppScreen,
	DetailRow,
	Divider,
	InfoPill,
	InputField,
	MetricPill,
	OnboardingPickerOption,
	PrimaryButton,
	ScreenHeader,
	SectionCard,
} from "../../components/common/UI";
import { GutScoreInfoCards } from "../../components/gut-score/GutScoreInfoCards";
import { WeeklyProgressCard } from "../../components/progress/WeeklyProgressCard";
import { onboardingSteps } from "../../data/onboarding";
import { trackEvent } from "../../services/analytics";
import { computeGutScoreState } from "../../services/ai/scoring";
import { useAppStore } from "../../store/useAppStore";
import { palette, spacing, tokens, type } from "../../theme";
import { OnboardingStackParamList } from "../../navigation/types";
import {
	createMockFeaturedDailyScoreDay,
	createMockWeeklyProgressDays,
} from "../../utils/weeklyProgress";

type Props = NativeStackScreenProps<OnboardingStackParamList, "OnboardingFlow">;
type IoniconName = ComponentProps<typeof Ionicons>["name"];
type RiskEvidenceTone = "low" | "medium" | "high";
type StartingScoreState = "ready" | "loading" | "revealed";

const PIP_WELCOME_GIF = require("../../../assets/pip/pip_welcome_gif_transparent.gif");
const PIP_THINKING = require("../../../assets/pip/pip_thinking_transparent.png");
const PIP_ANXIOUS = require("../../../assets/pip/pip_anxious_transparent.png");
const PIP_JOYOUS = require("../../../assets/pip/pip_joyous_transparent.png");
const GET_STARTED_BACKGROUND_IMAGE = require("../../../assets/get_started_background_image.png");
const BANANA_ASSET = require("../../../assets/ui/banana_transparent.png");
const CARROT_ASSET = require("../../../assets/ui/carrot_transparent.png");
const PLANT_1_ASSET = require("../../../assets/ui/plant_1_transparent.png");
const PLANT_2_ASSET = require("../../../assets/ui/plant_2_transparent.png");
const PLANT_3_ASSET = require("../../../assets/ui/plant_3_transparent.png");
const RICE_ASSET = require("../../../assets/ui/rice_transparent.png");
const TOAST_ASSET = require("../../../assets/ui/toast_transparent.png");
const GUT_ISSUES_DIAGRAM = require("../../../assets/ui/gut_issues_diagram.png");
const SCAN_FOOD_ILLUSTRATION = require("../../../assets/ui/scan_food_illustration.png");
const RISK_SCORE_ILLUSTRATION = require("../../../assets/ui/risk_score_illustration.png");
const LOG_SYMPTOMS_ILLUSTRATION = require("../../../assets/ui/log_symptoms_illustration.png");
const PHASE_2_ILLUSTRATION = require("../../../assets/ui/phase_2_illustration.png");
const CREAMY_TOMATO_PASTA_SCAN = require("../../../assets/ui/creamy_tomato_pasta_scan.png");
const MULTI_PURPOSE_FOOD_SCANNER = require("../../../assets/ui/multi_purpose_food_scanner.png");
const MULTI_PURPOSE_MENU_SCANNER = require("../../../assets/ui/multi_purpose_menu_scanner.png");
const MULTI_PURPOSE_BARCODE_SCANNER = require("../../../assets/ui/multi_purpose_barcode_scanner.png");
const EATING_OUT_ICON = require("../../../assets/ui/eating_out_icon.png");
const TRAVELLING_ICON = require("../../../assets/ui/travelling_icon.png");
const LEAVING_HOUSE_ICON = require("../../../assets/ui/leaving_house_icon.png");
const HEALTH_ANXIETY_ICON = require("../../../assets/ui/health_anxiety_icon.png");
const CONFIDENCE_BACK_ICON = require("../../../assets/ui/confidence_back_icon.png");
const HEALTH_BACK_ICON = require("../../../assets/ui/health_back_icon.png");
const LIFE_BACK_ICON = require("../../../assets/ui/life_back_icon.png");

type PhaseDiscoveryState = "scan" | "loading" | "result";
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const WELCOME_SWIRLS = [
	{
		path: "M-5 159 C49 88 158 48 276 72 C363 90 405 139 365 181 C314 234 173 228 75 190",
		opacity: 0.14,
		strokeWidth: 1.15,
		blur: 1.8,
	},
	{
		path: "M386 112 C321 161 225 171 137 143 C75 123 41 95 55 76 C74 50 151 65 199 95",
		opacity: 0.11,
		strokeWidth: 1,
		blur: 1.6,
	},
	{
		path: "M45 125 C93 166 185 181 268 153 C322 135 353 105 342 82 C327 51 240 55 181 91",
		opacity: 0.1,
		strokeWidth: 0.95,
		blur: 1.45,
	},
	{
		path: "M137 123 C158 96 206 91 234 116 C255 135 246 164 215 172 C179 183 138 166 132 143",
		opacity: 0.09,
		strokeWidth: 0.9,
		blur: 1.2,
	},
	{
		path: "M291 118 C319 92 354 95 364 117 C372 136 351 153 323 147",
		opacity: 0.08,
		strokeWidth: 0.85,
		blur: 1.1,
	},
	{
		path: "M70 109 C92 84 129 79 155 96 C177 110 172 132 148 142",
		opacity: 0.08,
		strokeWidth: 0.85,
		blur: 1.1,
	},
];

const WELCOME_SPARKLES = [
	{ cx: 71, cy: 82, r: 1.7, opacity: 0.22 },
	{ cx: 99, cy: 69, r: 1.15, opacity: 0.18 },
	{ cx: 284, cy: 76, r: 1.8, opacity: 0.22 },
	{ cx: 329, cy: 113, r: 1.25, opacity: 0.18 },
	{ cx: 108, cy: 181, r: 1.2, opacity: 0.16 },
	{ cx: 256, cy: 172, r: 1.35, opacity: 0.16 },
];

export function OnboardingFlowScreen({ navigation }: Props) {
	const stepIndex = useAppStore((state) => state.onboardingStepIndex);
	const answers = useAppStore((state) => state.onboardingAnswers);
	const setStepIndex = useAppStore((state) => state.setOnboardingStepIndex);
	const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
	const updateField = useAppStore((state) => state.updateOnboardingField);
	const toggleValue = useAppStore((state) => state.toggleOnboardingValue);
	const addCustomValue = useAppStore((state) => state.addCustomOnboardingValue);
	const removeCustomValue = useAppStore((state) => state.removeCustomOnboardingValue);
	const [customEntry, setCustomEntry] = useState("");
	const [customOptionModalVisible, setCustomOptionModalVisible] = useState(false);
	const [phaseDiscoveryState, setPhaseDiscoveryState] = useState<PhaseDiscoveryState>("scan");
	const [startingScoreState, setStartingScoreState] =
		useState<StartingScoreState>("ready");
	const phaseDiscoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const startingScoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

	const progress = ((stepIndex + 1) / stepCount) * 100;
	const hasImageBackground = step.backgroundVariant === "getStartedImage";
	const backIconColor = hasImageBackground ? tokens.color.utility.white : palette.primary;
	const titleColor = hasImageBackground ? tokens.color.utility.white : palette.primary;
	const subtitleColor = hasImageBackground ? "rgba(255, 255, 255, 0.86)" : undefined;
	const centerImageSource = getCenterImageSource(step.centerImage);
	const centerImageHeight = Math.min(Math.max(windowHeight * 0.39, 290), 370);
	const centerImageWidth = centerImageHeight * (1024 / 1535);
	const centerGraphic = renderCenterGraphic(step.centerGraphic, { phaseDiscoveryState });
	const isPhaseDiscoveryStep = step.id === "phase-discovery";
	const isStartingScoreStep = step.id === "gut-score-analyzing";
	const headerTitle =
		isStartingScoreStep && startingScoreState === "revealed"
			? "Your starting Gut Score is ready"
			: step.headline;
	const headerSubtitle =
		isStartingScoreStep && startingScoreState === "revealed"
			? "Higher is better. This is your starting gut calm estimate before the app learns from real daily reports."
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
		: step.cta;
	const ctaDisabled =
		(isPhaseDiscoveryStep && phaseDiscoveryState === "loading") ||
		(isStartingScoreStep && startingScoreState === "loading");

	useEffect(() => {
		clearPhaseDiscoveryTimeout();
		clearStartingScoreTimeout();
		if (step.id === "phase-discovery") {
			setPhaseDiscoveryState("scan");
		}
		if (step.id === "gut-score-analyzing") {
			setStartingScoreState("ready");
		}
	}, [step.id]);

	useEffect(() => {
		return () => {
			clearPhaseDiscoveryTimeout();
			clearStartingScoreTimeout();
		};
	}, []);

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

	function handleContinue() {
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

		trackEvent("onboarding_step_completed", { step_id: step.id, step_number: stepNumber });

		if (stepIndex >= onboardingSteps.length - 1) {
			navigation.replace("OnboardingPaywall");
			return;
		}

		setStepIndex(stepIndex + 1);
	}

	function handleBack() {
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

		if (stepIndex <= 0) {
			setOnboardingStage("intro");
			navigation.replace("GetStarted");
			return;
		}
		setStepIndex(stepIndex - 1);
	}

	function renderPreview() {
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
			case "trust":
				return (
					<SectionCard>
						<DetailRow
							label="Uses"
							value="Food analysis + your profile + learned patterns"
						/>
						<DetailRow
							label="Avoids"
							value="Diagnosis language or guaranteed safety claims"
						/>
						<Text style={styles.previewNote}>
							Hidden ingredients and preparation still matter.
						</Text>
					</SectionCard>
				);
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
						score={startingGutScore.currentScore}
						state={startingScoreState}
					/>
				);
			case "lowerScorePlan":
				return (
					<View style={styles.previewStack}>
						{[
							{
								label: "1",
								title: "Scan before eating",
								body: "See predicted meal risk and Gut Score impact.",
							},
							{
								label: "2",
								title: "Report the day",
								body: "Calm days raise your score. Symptom days lower it with evidence.",
							},
							{
								label: "3",
								title: "Isolate patterns",
								body: "Ingredients become learned triggers, safe foods, or needs-more-data.",
							},
							{
								label: "4",
								title: "Earn foods back",
								body: "When your score is high and calm, favorites become cautious reintroduction targets.",
							},
						].map((entry) => (
							<SectionCard key={entry.label} style={styles.planCard}>
								<InfoPill label={entry.label} tone="warm" />
								<View style={styles.planCopy}>
									<Text style={styles.previewTitle}>{entry.title}</Text>
									<Text style={styles.previewNote}>{entry.body}</Text>
								</View>
							</SectionCard>
						))}
					</View>
				);
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

	function renderSummary() {
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
					label="Foods to earn back"
					value={
						favoriteFoodsToReintroduce.trim() || "No reintroduction foods added yet."
					}
				/>
			</SectionCard>
		);
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

	function renderSelectionControls() {
		const pickerVariant = hasImageBackground ? "image" : "plain";

		if (step.type === "multi_select" && step.field && step.options) {
			const values = answers[step.field];
			const customField = customFieldForCurrentStep();
			const customCount = customField ? (answers[customField] ?? []).length : 0;

			return (
				<View style={styles.optionGrid}>
					{step.options.map((option) => (
						<OnboardingPickerOption
							key={option}
							label={option}
							iconName={step.optionIcons?.[option] as IoniconName | undefined}
							variant={pickerVariant}
							selected={Array.isArray(values) ? values.includes(option) : false}
							onPress={() =>
								toggleValue(
									step.field as
										| "conditions"
										| "ingredientSensitivities"
										| "symptoms"
										| "mealContexts"
										| "currentEatingPatterns"
										| "lifestyleFactors",
									option
								)
							}
						/>
					))}

					{step.allowCustom ? (
						<OnboardingPickerOption
							label="Other"
							variant={pickerVariant}
							badgeText={customCount > 0 ? `+${customCount}` : undefined}
							selected={false}
							onPress={() => setCustomOptionModalVisible(true)}
						/>
					) : null}
				</View>
			);
		}

		if (step.type === "single_select" && step.field && step.options) {
			const value = answers[step.field];
			return (
				<View style={styles.optionGrid}>
					{step.options.map((option) => (
						<OnboardingPickerOption
							key={option}
							label={option}
							iconName={step.optionIcons?.[option] as IoniconName | undefined}
							variant={pickerVariant}
							selected={value === option}
							onPress={() =>
								updateField(
									step.field as
										| "symptomFrequency"
										| "symptomSeverityBaseline"
										| "triedOtherGutHealthApps"
										| "motivation",
									option
								)
							}
						/>
					))}
				</View>
			);
		}

		if (
			step.type === "text_input" &&
			(step.field === "displayName" || step.field === "favoriteFoodsToReintroduce")
		) {
			const value =
				step.field === "displayName" ? answers.displayName : favoriteFoodsToReintroduce;
			return (
				<SectionCard>
					<InputField
						value={value}
						placeholder={
							step.field === "displayName"
								? "Enter a display name"
								: "pizza, coffee, pasta"
						}
						onChangeText={(nextValue) =>
							updateField(
								step.field as "displayName" | "favoriteFoodsToReintroduce",
								nextValue
							)
						}
					/>
				</SectionCard>
			);
		}

		if (step.type === "summary") {
			return renderSummary();
		}

		if (step.type === "preview") {
			return renderPreview();
		}

		return null;
	}

	const customOptionField = customFieldForCurrentStep();
	const customOptionValues = customOptionField ? answers[customOptionField] ?? [] : [];
	const customOptionCopy = getCustomOptionCopy();

	return (
		<AppScreen
			background={renderOnboardingBackground(
				step.backgroundVariant,
				windowWidth,
				windowHeight
			)}
		>
			<View style={styles.topBar}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Back"
					onPress={handleBack}
					style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
				>
					<Ionicons name="chevron-back" size={26} color={backIconColor} />
				</Pressable>
				<View style={styles.progressTrack}>
					<View style={[styles.progressFill, { width: `${progress}%` }]} />
				</View>
			</View>

			{step.id === "welcome" ? <WelcomeFoodScene /> : null}

			<ScreenHeader
				title={headerTitle}
				subtitle={headerSubtitle}
				titleColor={titleColor}
				titleStyle={hasImageBackground ? styles.imageBackgroundTitle : null}
				subtitleColor={subtitleColor}
			/>

			{step.helper ? <InfoPill label={step.helper} tone="soft" /> : null}

			{renderSelectionControls()}

			{centerImageSource ? (
				<View style={styles.centerImageSlot}>
					<Image
						source={centerImageSource}
						style={[
							styles.centerImage,
							{ width: centerImageWidth, height: centerImageHeight },
						]}
						resizeMode="contain"
						accessibilityIgnoresInvertColors
					/>
				</View>
			) : null}

			{centerGraphic ? <View style={styles.centerGraphicSlot}>{centerGraphic}</View> : null}

			<View style={styles.footer}>
				{step.footerBody ? (
					<Text
						style={[
							styles.footerBody,
							hasImageBackground ? styles.footerBodyOnImage : null,
						]}
					>
						{step.footerBody}
					</Text>
				) : null}
				<PrimaryButton label={ctaLabel} onPress={handleContinue} disabled={ctaDisabled} />
			</View>

			<Modal
				animationType="fade"
				transparent
				visible={customOptionModalVisible}
				onRequestClose={closeCustomOptionModal}
			>
				<View style={styles.customModalRoot}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close custom entry"
						style={styles.customModalBackdrop}
						onPress={closeCustomOptionModal}
					/>
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : undefined}
						pointerEvents="box-none"
						style={styles.customModalKeyboard}
					>
						<View style={styles.customModalCard}>
							<View style={styles.customModalHeader}>
								<View style={styles.customModalTitleWrap}>
									<Text style={styles.customModalTitle}>
										{customOptionCopy.title}
									</Text>
									<Text style={styles.customModalSubtitle}>
										{customOptionCopy.subtitle}
									</Text>
								</View>
								<Pressable
									accessibilityRole="button"
									accessibilityLabel="Close"
									onPress={closeCustomOptionModal}
									style={({ pressed }) => [
										styles.customModalClose,
										pressed && { opacity: 0.7 },
									]}
								>
									<Ionicons
										name="close"
										size={20}
										color={tokens.color.icon.primary}
									/>
								</Pressable>
							</View>
							<InputField
								value={customEntry}
								placeholder={customOptionCopy.placeholder}
								onChangeText={setCustomEntry}
								autoFocus
							/>
							<PrimaryButton
								label="Add"
								onPress={submitCustomOption}
								disabled={!customEntry.trim()}
							/>
							{customOptionValues.length > 0 ? (
								<View style={styles.customOptionStack}>
									{customOptionValues.map((value) => (
										<View key={value} style={styles.customValuePill}>
											<Text style={styles.customValueText}>{value}</Text>
											<Pressable
												accessibilityRole="button"
												accessibilityLabel={`Remove ${value}`}
												onPress={() => removeCustomOption(value)}
												hitSlop={8}
												style={({ pressed }) => [
													styles.customValueRemove,
													pressed && { opacity: 0.7 },
												]}
											>
												<Ionicons
													name="close"
													size={13}
													color={tokens.color.text.inverse}
												/>
											</Pressable>
										</View>
									))}
								</View>
							) : null}
						</View>
					</KeyboardAvoidingView>
				</View>
			</Modal>
		</AppScreen>
	);
}

function StartingGutScoreComputeCard({
	score,
	state,
}: {
	score: number;
	state: StartingScoreState;
}) {
	const ringProgress = useSharedValue(state === "revealed" ? score / 100 : 0.16);
	const ringScale = useSharedValue(1);
	const resultOpacity = useSharedValue(state === "revealed" ? 1 : 0);
	const resultTranslate = useSharedValue(state === "revealed" ? 0 : 10);
	const [visibleChecks, setVisibleChecks] = useState(state === "revealed" ? 4 : 0);
	const [displayScore, setDisplayScore] = useState(state === "revealed" ? score : 0);
	const radius = 62;
	const size = 150;
	const center = size / 2;
	const strokeWidth = 12;
	const circumference = 2 * Math.PI * radius;
	const isRevealed = state === "revealed";
	const isLoading = state === "loading";
	const ringColor = isRevealed ? scoreTone(score) : palette.primary;
	const statusLabel = isRevealed
		? "Starting Gut Score"
		: isLoading
		? "Computing"
		: "Ready to compute";
	const checklistItems = [
		"Symptoms and severity",
		"Known conditions",
		"Declared sensitivities",
		"Current patterns",
	];

	useEffect(() => {
		if (state === "ready") {
			setVisibleChecks(0);
			setDisplayScore(0);
			ringProgress.value = withTiming(0.16, { duration: 240 });
			resultOpacity.value = withTiming(0, { duration: 120 });
			resultTranslate.value = withTiming(10, { duration: 120 });
			ringScale.value = withTiming(1, { duration: 160 });
			return;
		}

		if (state === "loading") {
			setDisplayScore(0);
			setVisibleChecks(0);
			ringProgress.value = withTiming(0.92, {
				duration: 2100,
				easing: Easing.out(Easing.cubic),
			});
			resultOpacity.value = withTiming(0, { duration: 120 });
			resultTranslate.value = withTiming(10, { duration: 120 });
			const timers = [320, 760, 1220, 1700].map((delay, index) =>
				setTimeout(() => setVisibleChecks(index + 1), delay)
			);
			return () => timers.forEach(clearTimeout);
		}

		setVisibleChecks(4);
		ringProgress.value = withTiming(Math.max(score / 100, 0.04), {
			duration: 620,
			easing: Easing.out(Easing.cubic),
		});
		ringScale.value = withSequence(
			withTiming(1.035, { duration: 160 }),
			withTiming(1, { duration: 260 })
		);
		resultOpacity.value = withDelay(120, withTiming(1, { duration: 280 }));
		resultTranslate.value = withDelay(120, withTiming(0, { duration: 280 }));

		const startedAt = Date.now();
		const duration = 620;
		const interval = setInterval(() => {
			const elapsed = Date.now() - startedAt;
			const progress = Math.min(elapsed / duration, 1);
			setDisplayScore(Math.round(score * progress));
			if (progress >= 1) {
				clearInterval(interval);
			}
		}, 16);

		return () => clearInterval(interval);
	}, [ringProgress, ringScale, resultOpacity, resultTranslate, score, state]);

	const animatedRingProps = useAnimatedProps(() => ({
		strokeDashoffset: circumference * (1 - ringProgress.value),
	}));

	const ringAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: ringScale.value }],
	}));

	const resultAnimatedStyle = useAnimatedStyle(() => ({
		opacity: resultOpacity.value,
		transform: [{ translateY: resultTranslate.value }],
	}));

	return (
		<Animated.View style={styles.startingScoreCard}>
			<View style={styles.startingScoreHeader}>
				<View>
					<Text style={styles.educationEyebrow}>Gut Score</Text>
					<Text style={styles.startingScoreTitle}>
						{isRevealed ? healthTextForScore(score) : "Profile scan"}
					</Text>
				</View>
				<View
					style={[
						styles.startingScoreStatusPill,
						isRevealed ? { backgroundColor: scoreBackground(score) } : null,
					]}
				>
					<Text
						style={[
							styles.startingScoreStatusText,
							isRevealed ? { color: scoreTone(score) } : null,
						]}
					>
						{statusLabel}
					</Text>
				</View>
			</View>

			<Animated.View style={[styles.startingScoreRingWrap, ringAnimatedStyle]}>
				<Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
					<Circle
						cx={center}
						cy={center}
						r={radius}
						stroke={tokens.color.chart.track}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					<AnimatedCircle
						cx={center}
						cy={center}
						r={radius}
						stroke={ringColor}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						fill="none"
						strokeDasharray={`${circumference} ${circumference}`}
						animatedProps={animatedRingProps}
						transform={`rotate(-90 ${center} ${center})`}
					/>
				</Svg>
				<View style={styles.startingScoreCenter}>
					{isLoading ? (
						<StartingScoreLoadingDots color={ringColor} />
					) : (
						<Text style={[styles.startingScoreValue, { color: ringColor }]}>
							{isRevealed ? String(displayScore) : "--"}
						</Text>
					)}
					<Text style={styles.startingScoreCenterLabel}>
						{isRevealed ? "out of 100" : "Gut Score"}
					</Text>
				</View>
			</Animated.View>

			{isRevealed ? null : (
				<View style={styles.startingScoreChecklist}>
					{checklistItems.map((item, index) => {
						const complete = index < visibleChecks;
						return (
							<View key={item} style={styles.startingScoreCheckRow}>
								<View
									style={[
										styles.startingScoreCheckIcon,
										complete ? styles.startingScoreCheckIconComplete : null,
									]}
								>
									<Ionicons
										name={complete ? "checkmark" : "ellipse"}
										size={complete ? 14 : 6}
										color={
											complete
												? tokens.color.text.inverse
												: tokens.color.icon.muted
										}
									/>
								</View>
								<Text
									style={[
										styles.startingScoreCheckText,
										complete ? styles.startingScoreCheckTextComplete : null,
									]}
								>
									{item}
								</Text>
							</View>
						);
					})}
				</View>
			)}

			{isRevealed ? (
				<Animated.View style={[styles.startingScoreResultPanel, resultAnimatedStyle]}>
					<Text style={styles.startingScoreResultText}>
						{startingScoreExplanation(score)}
					</Text>
				</Animated.View>
			) : (
				<Text style={styles.startingScoreHint}>
					{isLoading
						? "Building your starting point from your profile answers."
						: "Tap below to turn your profile into a starting Gut Score."}
				</Text>
			)}
		</Animated.View>
	);
}

function StartingScoreLoadingDots({ color }: { color: string }) {
	return (
		<View style={styles.startingScoreDotRow}>
			<StartingScoreLoadingDot color={color} delay={0} />
			<StartingScoreLoadingDot color={color} delay={120} />
			<StartingScoreLoadingDot color={color} delay={240} />
		</View>
	);
}

function StartingScoreLoadingDot({ color, delay }: { color: string; delay: number }) {
	const translateY = useSharedValue(0);
	const opacity = useSharedValue(0.58);

	useEffect(() => {
		translateY.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(-8, { duration: 240, easing: Easing.out(Easing.cubic) }),
					withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) })
				),
				-1,
				false
			)
		);
		opacity.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1, { duration: 240 }),
					withTiming(0.58, { duration: 260 })
				),
				-1,
				false
			)
		);
	}, [delay, opacity, translateY]);

	const dotStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	return (
		<Animated.View
			style={[
				styles.startingScoreLoadingDot,
				{ backgroundColor: color },
				dotStyle,
			]}
		/>
	);
}

function WelcomeFoodScene() {
	return (
		<View style={styles.welcomeScene} pointerEvents="none">
			<WelcomeSwirls />

			<Image
				source={RICE_ASSET}
				style={[styles.floatingAsset, styles.riceAsset]}
				resizeMode="contain"
			/>
			<Image
				source={BANANA_ASSET}
				style={[styles.floatingAsset, styles.bananaAsset]}
				resizeMode="contain"
			/>
			<Image
				source={CARROT_ASSET}
				style={[styles.floatingAsset, styles.carrotAsset]}
				resizeMode="contain"
			/>
			<Image
				source={TOAST_ASSET}
				style={[styles.floatingAsset, styles.toastAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_1_ASSET}
				style={[styles.floatingAsset, styles.plantOneAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_2_ASSET}
				style={[styles.floatingAsset, styles.plantTwoAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_3_ASSET}
				style={[styles.floatingAsset, styles.plantThreeAsset]}
				resizeMode="contain"
			/>

			<Image
				source={PIP_WELCOME_GIF}
				style={styles.welcomeGif}
				resizeMode="contain"
				accessibilityLabel="Pip waving hello"
			/>
		</View>
	);
}

function WelcomeSwirls() {
	return (
		<View pointerEvents="none" style={styles.swirlLayer}>
			<Canvas style={StyleSheet.absoluteFill}>
				{WELCOME_SWIRLS.map((swirl) => (
					<SkiaPath
						key={`soft-${swirl.path}`}
						path={swirl.path}
						color="white"
						opacity={swirl.opacity}
						style="stroke"
						strokeWidth={swirl.strokeWidth + 2}
						strokeCap="round"
					>
						<BlurMask blur={swirl.blur} style="normal" />
					</SkiaPath>
				))}
				{WELCOME_SWIRLS.map((swirl) => (
					<SkiaPath
						key={`line-${swirl.path}`}
						path={swirl.path}
						color="white"
						opacity={swirl.opacity * 0.8}
						style="stroke"
						strokeWidth={swirl.strokeWidth}
						strokeCap="round"
					/>
				))}
				{WELCOME_SPARKLES.map((sparkle) => (
					<SkiaCircle
						key={`${sparkle.cx}-${sparkle.cy}`}
						cx={sparkle.cx}
						cy={sparkle.cy}
						r={sparkle.r}
						color="white"
						opacity={sparkle.opacity}
					/>
				))}
			</Canvas>
		</View>
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

function renderCenterGraphic(
	centerGraphic: string | undefined,
	options?: { phaseDiscoveryState?: PhaseDiscoveryState }
) {
	switch (centerGraphic) {
		case "empathyProblem":
			return <EmpathyProblemGraphic />;
		case "healingPromise":
			return <HealingPromiseGraphic />;
		case "gutScoreScale":
			return (
				<View style={styles.educationCard}>
					<View style={styles.educationScoreHeader}>
						<View>
							<Text style={styles.educationEyebrow}>Gut Score</Text>
							<Text style={styles.educationCardTitle}>Overall rating</Text>
						</View>
						<Text
							style={[
								styles.educationScoreValue,
								{ color: tokens.color.status.risk.medium.tint },
							]}
						>
							42
							<Text style={styles.educationScoreScale}>/100</Text>
						</Text>
					</View>
					<View style={styles.gutScoreScaleTrack}>
						<View
							style={[
								styles.gutScoreScaleSegment,
								styles.gutScoreScaleStart,
								{ backgroundColor: tokens.color.status.risk.high.tint },
							]}
						/>
						<View
							style={[
								styles.gutScoreScaleSegment,
								{ backgroundColor: tokens.color.status.risk.medium.tint },
							]}
						/>
						<View
							style={[
								styles.gutScoreScaleSegment,
								styles.gutScoreScaleEnd,
								{ backgroundColor: tokens.color.status.risk.low.tint },
							]}
						/>
					</View>
					<View style={styles.scaleLabelRow}>
						<Text
							style={[
								styles.scaleEndpointLabel,
								{ color: tokens.color.status.risk.high.foreground },
							]}
						>
							Reactive
						</Text>
						<Text
							style={[
								styles.scaleEndpointLabel,
								{ color: tokens.color.status.risk.low.foreground },
							]}
						>
							Calmer
						</Text>
					</View>
					<GutScoreInfoCards />
					<View style={styles.educationSignalRow}>
						<View style={styles.educationIconBadge}>
							<Ionicons
								name="trending-up"
								size={18}
								color={tokens.color.status.risk.low.foreground}
							/>
						</View>
						<Text style={styles.educationSignalText}>
							Higher means your gut looks more stable over time. Raise your score!
						</Text>
					</View>
				</View>
			);
		case "dailyScoreCard": {
			const mockDays = createMockWeeklyProgressDays();
			return (
				<WeeklyProgressCard
					days={mockDays}
					mode="preview"
					showChevron={false}
					featuredDay={createMockFeaturedDailyScoreDay()}
					featuredLabel="Yesterday"
				/>
			);
		}
		case "healingLoopDiagram":
			return <HealingLoopDiagram />;
		case "phaseDiscovery":
			return <PhaseDiscoveryGraphic state={options?.phaseDiscoveryState ?? "scan"} />;
		case "phaseLimitation":
			return <PhaseLimitationGraphic />;
		case "phaseReintroduction":
			return <PhaseReintroductionGraphic />;
		case "scannerModesOverview":
			return <ScannerModesOverviewGraphic />;
		case "foodControlIntro":
			return <FoodControlIntroGraphic />;
		case "foodLeverComparison":
			return <FoodLeverComparisonGraphic />;
		default:
			return null;
	}
}

function EmpathyProblemGraphic() {
	return (
		<View style={styles.empathyGraphic}>
			<View style={styles.empathySceneCard}>
				<View style={styles.empathyPipHalo} />
				<Image
					source={PIP_ANXIOUS}
					style={styles.empathyPip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling anxious"
				/>
				<EmpathyConcernCard
					imageSource={EATING_OUT_ICON}
					label="Worried to eat out"
					positionStyle={styles.empathyConcernTopLeft}
				/>
				<EmpathyConcernCard
					imageSource={TRAVELLING_ICON}
					label="Nervous to travel"
					positionStyle={styles.empathyConcernTopRight}
				/>
				<EmpathyConcernCard
					imageSource={LEAVING_HOUSE_ICON}
					label="Scared to leave your house"
					positionStyle={styles.empathyConcernBottomLeft}
				/>
				<EmpathyConcernCard
					imageSource={HEALTH_ANXIETY_ICON}
					label="Anxious about your health"
					positionStyle={styles.empathyConcernBottomRight}
				/>
			</View>
		</View>
	);
}

function EmpathyConcernCard({
	imageSource,
	label,
	positionStyle,
}: {
	imageSource: ImageSourcePropType;
	label: string;
	positionStyle: StyleProp<ViewStyle>;
}) {
	return (
		<View style={[styles.empathyConcernCard, positionStyle]}>
			<View style={styles.empathyConcernIconSlot}>
				<Image
					source={imageSource}
					style={styles.empathyConcernIcon}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>
			<Text style={styles.empathyConcernText}>{label}</Text>
		</View>
	);
}

function HealingPromiseGraphic() {
	return (
		<View style={styles.promiseGraphic}>
			<View style={styles.promiseHeroCard}>
				<View style={styles.promiseHeroGlow} />
				<Image
					source={PIP_JOYOUS}
					style={styles.promisePip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling better"
				/>
				<View style={styles.promiseHeroAccent}>
					<Ionicons name="trending-up" size={19} color={tokens.color.icon.accent} />
					<Text style={styles.promiseHeroAccentText}>Small steps. Real progress.</Text>
				</View>
			</View>

			<View style={styles.promiseCardRow}>
				<PromiseOutcomeCard
					imageSource={CONFIDENCE_BACK_ICON}
					title="Confidence"
					body="Feel like yourself again."
				/>
				<PromiseOutcomeCard
					imageSource={HEALTH_BACK_ICON}
					title="Health"
					body="Stronger gut. More energy."
				/>
				<PromiseOutcomeCard
					imageSource={LIFE_BACK_ICON}
					title="Life"
					body="More freedom. More you."
				/>
			</View>
		</View>
	);
}

function PromiseOutcomeCard({
	imageSource,
	title,
	body,
}: {
	imageSource: ImageSourcePropType;
	title: string;
	body: string;
}) {
	return (
		<View style={styles.promiseOutcomeCard}>
			<Image
				source={imageSource}
				style={styles.promiseOutcomeIcon}
				resizeMode="contain"
				accessibilityIgnoresInvertColors
			/>
			<Text style={styles.promiseOutcomeTitle}>{title}</Text>
			<View style={styles.promiseDividerMark} />
			<Text style={styles.promiseOutcomeBody}>{body}</Text>
		</View>
	);
}

function PhaseDiscoveryGraphic({ state }: { state: PhaseDiscoveryState }) {
	return (
		<View style={styles.phaseDiscoveryCard}>
			<View style={styles.phaseDiscoveryHeader}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>1</Text>
				</View>
				<View style={styles.phaseDiscoveryHeaderCopy}>
					<Text style={styles.educationEyebrow}>Discovery</Text>
					<Text style={styles.phaseDiscoveryTitle}>Adaptive risk scores</Text>
				</View>
			</View>

			<View style={styles.phaseDiscoveryStage}>
				{state === "scan" ? <DiscoveryScanPreview /> : null}
				{state === "loading" ? <DiscoveryAnalyzingState /> : null}
				{state === "result" ? <DiscoveryRiskResult /> : null}
			</View>
		</View>
	);
}

function DiscoveryScanPreview() {
	return (
		<View style={styles.discoveryScanCard}>
			<Image
				source={CREAMY_TOMATO_PASTA_SCAN}
				style={styles.discoveryScanImage}
				resizeMode="cover"
				accessibilityIgnoresInvertColors
			/>
			<View style={styles.discoveryScanOverlay}>
				<View style={styles.mealScanChip}>
					<Ionicons name="camera-outline" size={15} color={tokens.color.icon.accent} />
					<Text style={styles.mealScanChipText}>Meal scan</Text>
				</View>
				<View style={styles.scanReadyBadge}>
					<Ionicons name="scan-outline" size={15} color={tokens.color.utility.white} />
				</View>
			</View>
		</View>
	);
}

function DiscoveryAnalyzingState() {
	return (
		<View style={[styles.discoveryScanCard, styles.discoveryAnalyzingCard]}>
			<View style={styles.analyzingIconWrap}>
				<ActivityIndicator color={palette.primary} />
			</View>
			<Text style={styles.analyzingTitle}>Analyzing meal...</Text>
			<Text style={styles.analyzingBody}>
				Finding ingredients and matching them to your history.
			</Text>
			<View style={styles.analyzingDotRow}>
				<View style={styles.analyzingDot} />
				<View style={[styles.analyzingDot, styles.analyzingDotMuted]} />
				<View style={[styles.analyzingDot, styles.analyzingDotMuted]} />
			</View>
		</View>
	);
}

function DiscoveryRiskResult() {
	return (
		<View style={styles.discoveryResultCard}>
			<View style={styles.resultHeaderRow}>
				<View style={styles.resultTitleStack}>
					<Text style={styles.educationEyebrow}>Scanned dish</Text>
					<Text style={styles.resultDishTitle}>Creamy tomato pasta</Text>
				</View>
				<View style={styles.highRiskPill}>
					<Ionicons
						name="alert-circle"
						size={15}
						color={tokens.color.status.risk.high.foreground}
					/>
					<Text style={styles.highRiskPillText}>High risk</Text>
				</View>
			</View>
			<View style={styles.resultScoreRow}>
				<AdaptiveRiskGauge />
				<View style={styles.resultInsightCard}>
					<Text style={styles.adaptiveRiskTitle}>Tomato keeps showing up</Text>
					<Text style={styles.adaptiveRiskBody}>
						Tomato has been a consistent trigger in your reflux symptom reports.
					</Text>
				</View>
			</View>
			<View style={styles.resultChipRow}>
				<ResultIngredientChip label="Tomato" tone="high" />
				<ResultIngredientChip label="Cream" tone="medium" />
				<ResultIngredientChip label="Garlic" tone="medium" />
			</View>
		</View>
	);
}

function ResultIngredientChip({ label, tone }: { label: string; tone: "high" | "medium" }) {
	const toneStyle =
		tone === "high" ? styles.resultIngredientChipHigh : styles.resultIngredientChipMedium;
	const textStyle =
		tone === "high"
			? styles.resultIngredientChipTextHigh
			: styles.resultIngredientChipTextMedium;

	return (
		<View style={[styles.resultIngredientChip, toneStyle]}>
			<Text style={[styles.resultIngredientChipText, textStyle]}>{label}</Text>
		</View>
	);
}

function AdaptiveRiskGauge() {
	const centerX = 68;
	const centerY = 66;
	const radius = 39;
	const needleEnd = polarPoint(centerX, centerY, 31, 48);

	return (
		<View style={styles.adaptiveGaugeWrap} accessible accessibilityLabel="High risk gauge">
			<Svg width={136} height={80} viewBox="0 0 136 80">
				<Path
					d={gaugeArcPath(centerX, centerY, radius, -116, -42)}
					stroke={tokens.color.status.risk.low.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
					opacity={0.38}
				/>
				<Path
					d={gaugeArcPath(centerX, centerY, radius, -25, 25)}
					stroke={tokens.color.status.risk.medium.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
					opacity={0.62}
				/>
				<Path
					d={gaugeArcPath(centerX, centerY, radius, 42, 116)}
					stroke={tokens.color.status.risk.high.tint}
					strokeWidth={11}
					strokeLinecap="round"
					fill="none"
				/>
				<Path
					d={`M ${centerX} ${centerY} L ${needleEnd.x} ${needleEnd.y}`}
					stroke={tokens.color.status.risk.high.foreground}
					strokeWidth={5}
					strokeLinecap="round"
					fill="none"
				/>
				<Circle
					cx={centerX}
					cy={centerY}
					r={9}
					fill={tokens.color.status.risk.high.foreground}
				/>
				<Circle cx={centerX} cy={centerY} r={4} fill={tokens.color.surface.card.default} />
			</Svg>
			<Text style={styles.adaptiveGaugeValue}>78</Text>
			<Text style={styles.adaptiveGaugeLabel}>risk score</Text>
		</View>
	);
}

function DiscoverySignal({ iconName, label }: { iconName: IoniconName; label: string }) {
	return (
		<View style={styles.discoverySignal}>
			<Ionicons name={iconName} size={16} color={tokens.color.icon.accent} />
			<Text style={styles.discoverySignalText}>{label}</Text>
		</View>
	);
}

function gaugeArcPath(
	cx: number,
	cy: number,
	radius: number,
	startAngle: number,
	endAngle: number
) {
	const start = polarPoint(cx, cy, radius, endAngle);
	const end = polarPoint(cx, cy, radius, startAngle);
	const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

	return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarPoint(cx: number, cy: number, radius: number, angleInDegrees: number) {
	const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

	return {
		x: cx + radius * Math.cos(angleInRadians),
		y: cy + radius * Math.sin(angleInRadians),
	};
}

function HealingLoopDiagram() {
	const steps = [
		{
			step: "1",
			title: "Scan food",
			body: "Take a picture. AI deciphers ingredients",
			imageSource: SCAN_FOOD_ILLUSTRATION,
		},
		{
			step: "2",
			title: "Log how you felt",
			body: "Report symptoms once a day.",
			imageSource: LOG_SYMPTOMS_ILLUSTRATION,
		},
		{
			step: "3",
			title: "Learn personalized risk",
			body: "AI learns sensitivity patterns over time and teaches you food risks.",
			imageSource: RISK_SCORE_ILLUSTRATION,
		},
		{
			step: "4",
			title: "Scores improve",
			body: "Gut Score improves as you adapt to findings.",
			renderVisual: () => <HealingScoreMiniChart />,
		},
	];

	return (
		<View style={styles.healingLoopWrap}>
			<Svg
				width={54}
				height={344}
				viewBox="0 0 54 344"
				style={styles.healingLoopConnector}
				pointerEvents="none"
			>
				<Path
					d="M27 35 C4 74 5 102 27 132 C49 163 49 192 27 223 C5 253 5 284 27 316"
					stroke={tokens.color.border.strong}
					strokeWidth={1.25}
					strokeLinecap="round"
					strokeDasharray="4 7"
					fill="none"
					opacity={0.45}
				/>
			</Svg>
			{steps.map((step) => (
				<HealingLoopStepCard
					key={step.step}
					step={step.step}
					title={step.title}
					body={step.body}
					imageSource={step.imageSource}
					renderVisual={step.renderVisual}
				/>
			))}
		</View>
	);
}

function HealingLoopStepCard({
	step,
	title,
	body,
	imageSource,
	renderVisual,
}: {
	step: string;
	title: string;
	body: string;
	imageSource?: ImageSourcePropType;
	renderVisual?: () => ReactNode;
}) {
	return (
		<View style={styles.healingLoopRow}>
			<View style={styles.healingLoopBadge}>
				<Text style={styles.healingLoopBadgeText}>{step}</Text>
			</View>
			<View style={styles.healingLoopCard}>
				<View style={styles.healingLoopVisualSlot}>
					{imageSource ? (
						<Image
							source={imageSource}
							style={styles.healingLoopImage}
							resizeMode="contain"
							accessibilityIgnoresInvertColors
						/>
					) : (
						renderVisual?.()
					)}
				</View>
				<View style={styles.healingLoopCopy}>
					<Text style={styles.healingLoopTitle}>{title}</Text>
					<Text style={styles.healingLoopBody}>{body}</Text>
				</View>
			</View>
		</View>
	);
}

function HealingScoreMiniChart() {
	return (
		<View style={styles.healingScoreVisual}>
			<View style={styles.healingScoreRing}>
				<Svg width={56} height={56} viewBox="0 0 56 56">
					<Circle
						cx={28}
						cy={28}
						r={22}
						stroke={tokens.color.chart.track}
						strokeWidth={6}
						fill="none"
					/>
					<Circle
						cx={28}
						cy={28}
						r={22}
						stroke={tokens.color.status.risk.low.tint}
						strokeWidth={6}
						fill="none"
						strokeLinecap="round"
						strokeDasharray={`${2 * Math.PI * 22} ${2 * Math.PI * 22}`}
						strokeDashoffset={2 * Math.PI * 22 * 0.18}
						rotation="-90"
						origin="28, 28"
					/>
				</Svg>
				<View style={styles.healingScoreRingCenter}>
					<Text style={styles.healingScoreValue}>82</Text>
				</View>
			</View>
		</View>
	);
}

function SignalRow({ iconName, label }: { iconName: IoniconName; label: string }) {
	return (
		<View style={styles.signalRow}>
			<Ionicons name={iconName} size={17} color={tokens.color.icon.accent} />
			<Text style={styles.signalRowText}>{label}</Text>
		</View>
	);
}

function PhaseLimitationGraphic() {
	return (
		<View style={styles.phaseLimitationCard}>
			<View style={styles.phaseDiscoveryHeader}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>2</Text>
				</View>
				<View style={styles.phaseDiscoveryHeaderCopy}>
					<Text style={styles.educationEyebrow}>Limitation</Text>
					<Text style={styles.phaseDiscoveryTitle}>Risk scores become a plan</Text>
				</View>
				<Image
					source={PHASE_2_ILLUSTRATION}
					style={styles.phaseLimitationIllustration}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>

			<View style={styles.limitationEvidencePanel}>
				<View style={styles.limitationEvidenceHeader}>
					<View>
						<Text style={styles.limitationEvidenceTitle}>Likely triggers</Text>
					</View>
					<View style={styles.limitPlanBadge}>
						<Ionicons
							name="remove-circle-outline"
							size={15}
							color={tokens.color.status.risk.medium.foreground}
						/>
						<Text style={styles.limitPlanBadgeText}>Limit</Text>
					</View>
				</View>

				<View style={styles.ingredientEvidenceStack}>
					<IngredientEvidenceRow
						ingredient="Tomato"
						evidence="Appears often on reflux days"
						pillLabel="High risk"
						tone="high"
						iconName="alert-circle-outline"
					/>
					<IngredientEvidenceRow
						ingredient="Garlic"
						evidence="Shows up on reactive reports"
						pillLabel="Watch closely"
						tone="medium"
						iconName="eye-outline"
					/>
					<IngredientEvidenceRow
						ingredient="Cream"
						evidence="Needs more data"
						pillLabel="Possible"
						tone="medium"
						iconName="flask-outline"
					/>
				</View>

				<View style={styles.limitationCallout}>
					<View style={styles.limitationCalloutIcon}>
						<Ionicons
							name="trending-up"
							size={17}
							color={tokens.color.status.risk.low.foreground}
						/>
					</View>
					<Text style={styles.limitationCalloutText}>
						Limit likely triggers and watch your Gut Score rise.
					</Text>
				</View>
			</View>
		</View>
	);
}

function IngredientEvidenceRow({
	ingredient,
	evidence,
	pillLabel,
	tone,
	iconName,
}: {
	ingredient: string;
	evidence: string;
	pillLabel: string;
	tone: RiskEvidenceTone;
	iconName: IoniconName;
}) {
	const toneColors = riskEvidenceColors(tone);

	return (
		<View style={styles.ingredientEvidenceRow}>
			<View
				style={[styles.ingredientEvidenceIcon, { backgroundColor: toneColors.background }]}
			>
				<Ionicons name={iconName} size={18} color={toneColors.foreground} />
			</View>
			<View style={styles.ingredientEvidenceCopy}>
				<Text style={styles.ingredientEvidenceTitle}>{ingredient}</Text>
				<Text style={styles.ingredientEvidenceBody}>{evidence}</Text>
			</View>
			<View style={[styles.riskEvidencePill, { backgroundColor: toneColors.background }]}>
				<Text style={[styles.riskEvidencePillText, { color: toneColors.foreground }]}>
					{pillLabel}
				</Text>
			</View>
		</View>
	);
}

function PhaseReintroductionGraphic() {
	return (
		<View style={styles.phaseReintroductionCard}>
			<View style={styles.phaseDiscoveryHeader}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>3</Text>
				</View>
				<View style={styles.phaseDiscoveryHeaderCopy}>
					<Text style={styles.educationEyebrow}>Reintroduction</Text>
					<Text style={styles.phaseDiscoveryTitle}>Earn foods back carefully</Text>
				</View>
				<View style={styles.reintroductionHeroIcon}>
					<Ionicons
						name="leaf-outline"
						size={34}
						color={tokens.color.status.risk.low.foreground}
					/>
				</View>
			</View>

			<View style={styles.reintroductionPlanPanel}>
				<View style={styles.limitationEvidenceHeader}>
					<Text style={styles.limitationEvidenceTitle}>Guided tests</Text>
					<View style={styles.reintroductionPlanBadge}>
						<Ionicons
							name="lock-open-outline"
							size={15}
							color={tokens.color.status.risk.low.foreground}
						/>
						<Text style={styles.reintroductionPlanBadgeText}>Unlocked</Text>
					</View>
				</View>

				<View style={styles.ingredientEvidenceStack}>
					<PhasePlanRow
						title="Test one food"
						body="Small serving, clear baseline"
						pillLabel="Careful"
						tone="medium"
						iconName="flask-outline"
					/>
					<PhasePlanRow
						title="Learn tolerance"
						body="Scans and reports update future risk"
						pillLabel="Adaptive"
						tone="low"
						iconName="sync-outline"
					/>
				</View>

				<View style={styles.reintroductionCallout}>
					<View style={styles.limitationCalloutIcon}>
						<Ionicons
							name="heart-outline"
							size={17}
							color={tokens.color.status.risk.low.foreground}
						/>
					</View>
					<Text style={styles.limitationCalloutText}>
						Eat more of what you love with confidence.
					</Text>
				</View>
			</View>
		</View>
	);
}

function PhasePlanRow({
	title,
	body,
	pillLabel,
	tone,
	iconName,
}: {
	title: string;
	body: string;
	pillLabel: string;
	tone: RiskEvidenceTone;
	iconName: IoniconName;
}) {
	const toneColors = riskEvidenceColors(tone);

	return (
		<View style={styles.ingredientEvidenceRow}>
			<View
				style={[styles.ingredientEvidenceIcon, { backgroundColor: toneColors.background }]}
			>
				<Ionicons name={iconName} size={18} color={toneColors.foreground} />
			</View>
			<View style={styles.ingredientEvidenceCopy}>
				<Text style={styles.ingredientEvidenceTitle}>{title}</Text>
				<Text style={styles.ingredientEvidenceBody}>{body}</Text>
			</View>
			<View style={[styles.riskEvidencePill, { backgroundColor: toneColors.background }]}>
				<Text style={[styles.riskEvidencePillText, { color: toneColors.foreground }]}>
					{pillLabel}
				</Text>
			</View>
		</View>
	);
}

function ScannerModesOverviewGraphic() {
	return (
		<View style={styles.scannerModesCard}>
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_FOOD_SCANNER}
				iconName="camera-outline"
				title="Scan meals"
				body="Turn food into personalized risk scores."
			/>
			<View style={styles.scannerModeDivider} />
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_MENU_SCANNER}
				iconName="restaurant-outline"
				title="Scan menus"
				body="See the top 3 best and worst items for your gut."
			/>
			<View style={styles.scannerModeDivider} />
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_BARCODE_SCANNER}
				iconName="barcode-outline"
				title="Scan barcodes"
				body="Check risk, preservatives, seed oils, and more."
			/>
		</View>
	);
}

function ScannerModeRow({
	imageSource,
	iconName,
	title,
	body,
}: {
	imageSource: ImageSourcePropType;
	iconName: IoniconName;
	title: string;
	body: string;
}) {
	return (
		<View style={styles.scannerModeRow}>
			<View style={styles.scannerModeImageSlot}>
				<Image
					source={imageSource}
					style={styles.scannerModeImage}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>
			<View style={styles.scannerModeCopy}>
				<View style={styles.scannerModeIconBadge}>
					<Ionicons name={iconName} size={21} color={tokens.color.icon.accent} />
				</View>
				<View style={styles.scannerModeTextStack}>
					<Text style={styles.scannerModeTitle}>{title}</Text>
					<Text style={styles.scannerModeBody}>{body}</Text>
				</View>
			</View>
		</View>
	);
}

function FoodControlIntroGraphic() {
	return (
		<View style={styles.foodControlIntro}>
			<View style={styles.foodControlHeroCard}>
				<View style={styles.foodControlGlassSheen} />
				<Image
					source={PIP_THINKING}
					style={styles.foodControlPip}
					resizeMode="contain"
					accessibilityLabel="Pip thinking"
				/>
				<Image
					source={RICE_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlRiceAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={BANANA_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlBananaAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={CARROT_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlCarrotAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={TOAST_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlToastAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_1_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantOneAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_2_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantTwoAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Image
					source={PLANT_3_ASSET}
					style={[styles.foodControlFloatingAsset, styles.foodControlPlantThreeAsset]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Text style={styles.foodControlWord}>FOOD</Text>
				<View style={styles.foodControlPill}>
					<Text style={styles.foodControlPillText}>The #1 thing you can control</Text>
				</View>
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleOne]} />
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleTwo]} />
				<View style={[styles.foodControlSparkle, styles.foodControlSparkleThree]} />
			</View>

			<View style={styles.foodControlMiniRow}>
				<FoodControlMiniCard
					rank="#1"
					title="Food"
					body="Most impact\nMost control"
					iconName="leaf-outline"
					tone="low"
					featured
				/>
				<FoodControlMiniCard
					title="Sleep"
					body="Some impact\nSome control"
					iconName="moon"
					tone="medium"
				/>
				<FoodControlMiniCard
					title="Stress"
					body="High impact\nLow control"
					iconName="flash-outline"
					tone="high"
				/>
			</View>
		</View>
	);
}

function FoodControlMiniCard({
	rank,
	title,
	body,
	iconName,
	tone,
	featured,
}: {
	rank?: string;
	title: string;
	body: string;
	iconName: IoniconName;
	tone: RiskEvidenceTone;
	featured?: boolean;
}) {
	const toneColors = riskEvidenceColors(tone);
	const bodyText = body.replace(/\\n/g, "\n");

	return (
		<View
			style={[
				styles.foodControlMiniCard,
				featured ? styles.foodControlMiniCardFeatured : null,
			]}
		>
			{rank ? (
				<View style={styles.foodControlMiniRank}>
					<Text style={styles.foodControlMiniRankText}>{rank}</Text>
				</View>
			) : null}
			<View style={[styles.foodControlMiniIcon, { backgroundColor: toneColors.background }]}>
				<Ionicons name={iconName} size={28} color={toneColors.foreground} />
			</View>
			<Text style={[styles.foodControlMiniTitle, { color: toneColors.foreground }]}>
				{title}
			</Text>
			<Text style={styles.foodControlMiniBody}>{bodyText}</Text>
		</View>
	);
}

function FoodLeverComparisonGraphic() {
	return (
		<View style={styles.foodLeverWrap}>
			<View style={styles.foodLeverHeroCard}>
				<View style={styles.foodLeverHeroContent}>
					<View style={styles.foodLeverRankBadge}>
						<Text style={styles.foodLeverRankText}>1</Text>
					</View>
					<View style={styles.foodLeverHeroCopy}>
						<Text style={styles.foodLeverHeroTitle}>Food</Text>
						<View style={styles.foodLeverImpactRow}>
							<Ionicons name="sparkles" size={15} color={tokens.color.icon.accent} />
							<Text style={styles.foodLeverImpactText}>Biggest impact</Text>
						</View>
						<Text style={styles.foodLeverSubtext}>Most controllable</Text>
					</View>
				</View>

				<View style={styles.foodLeverHeroVisualWrap}>
					<View style={styles.foodLeverChoiceBadge}>
						<Ionicons name="checkmark" size={15} color={tokens.color.text.inverse} />
						<Text style={styles.foodLeverChoiceText}>You choose what you eat</Text>
					</View>
					<View style={styles.foodLeverImageHalo} />
					<Image
						source={MULTI_PURPOSE_FOOD_SCANNER}
						style={styles.foodLeverFoodImage}
						resizeMode="contain"
						accessibilityIgnoresInvertColors
					/>
				</View>

				<View style={styles.foodLeverScaleBlock}>
					<View style={styles.foodLeverScaleTrack}>
						<View style={styles.foodLeverScaleFill} />
					</View>
					<View style={styles.foodLeverScaleLabels}>
						<Text style={styles.foodLeverScaleLabel}>Impact</Text>
						<Text style={styles.foodLeverScaleLabel}>High</Text>
					</View>
				</View>
			</View>

			<FoodLeverSecondaryRow
				rank="2"
				title="Stress"
				body="Also matters"
				label="Moderate impact"
				tone="medium"
				iconName="flash-outline"
			/>
			<FoodLeverSecondaryRow
				rank="3"
				title="Sleep"
				body="Also matters"
				label="Lower impact"
				tone="high"
				iconName="moon"
			/>

			<View style={styles.foodLeverCallout}>
				<View style={styles.foodLeverCalloutIcon}>
					<Ionicons name="heart-outline" size={21} color={tokens.color.icon.accent} />
				</View>
				<Text style={styles.foodLeverCalloutText}>
					We focus on the thing you can change first.
				</Text>
			</View>
		</View>
	);
}

function FoodLeverSecondaryRow({
	rank,
	title,
	body,
	label,
	tone,
	iconName,
}: {
	rank: string;
	title: string;
	body: string;
	label: string;
	tone: "medium" | "high";
	iconName: IoniconName;
}) {
	const toneColors =
		tone === "medium" ? tokens.color.status.risk.medium : tokens.color.status.risk.high;

	return (
		<View style={styles.foodLeverSecondaryCard}>
			<View style={styles.foodLeverSecondaryRank}>
				<Text style={styles.foodLeverSecondaryRankText}>{rank}</Text>
			</View>
			<View
				style={[styles.foodLeverSecondaryIcon, { backgroundColor: toneColors.background }]}
			>
				<Ionicons name={iconName} size={28} color={toneColors.foreground} />
			</View>
			<View style={styles.foodLeverSecondaryCopy}>
				<Text style={styles.foodLeverSecondaryTitle}>{title}</Text>
				<Text style={styles.foodLeverSecondaryBody}>{body}</Text>
			</View>
			<View style={styles.foodLeverSecondaryMetric}>
				<View style={styles.foodLeverMiniTrack}>
					<View
						style={[
							styles.foodLeverMiniFill,
							{
								width: tone === "medium" ? "62%" : "32%",
								backgroundColor: toneColors.tint,
							},
						]}
					/>
				</View>
				<Text style={[styles.foodLeverMetricLabel, { color: toneColors.foreground }]}>
					{label}
				</Text>
			</View>
		</View>
	);
}

function PhaseGraphic({
	phase,
	iconName,
	tone,
	title,
	rows,
}: {
	phase: string;
	iconName: IoniconName;
	tone: string;
	title: string;
	rows: Array<{ iconName: IoniconName; label: string }>;
}) {
	return (
		<View style={styles.phaseGraphicCard}>
			<View style={styles.phaseHeroRow}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>{phase}</Text>
				</View>
				<View style={styles.phaseIconWrap}>
					<Ionicons name={iconName} size={34} color={tone} />
				</View>
				<View style={styles.phaseTitleWrap}>
					<Text style={styles.educationEyebrow}>Phase {phase}</Text>
					<Text style={styles.phaseGraphicTitle}>{title}</Text>
				</View>
			</View>
			<View style={styles.phaseRows}>
				{rows.map((row) => (
					<SignalRow key={row.label} iconName={row.iconName} label={row.label} />
				))}
			</View>
		</View>
	);
}

function riskEvidenceColors(tone: RiskEvidenceTone) {
	if (tone === "high") return tokens.color.status.risk.high;
	if (tone === "medium") return tokens.color.status.risk.medium;
	return tokens.color.status.risk.low;
}

function scoreTone(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.foreground;
	if (score >= 34) return tokens.color.status.risk.medium.foreground;
	return tokens.color.status.risk.high.foreground;
}

function scoreBackground(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.background;
	if (score >= 34) return tokens.color.status.risk.medium.background;
	return tokens.color.status.risk.high.background;
}

function healthLabelForGauge(score: number) {
	if (score >= 67) return "low" as const;
	if (score >= 34) return "medium" as const;
	return "high" as const;
}

function healthTextForScore(score: number) {
	if (score >= 67) return "Calm";
	if (score >= 34) return "Mixed";
	return "Reactive";
}

function startingScoreExplanation(score: number) {
	if (score >= 67) {
		return "Pretty decent. You are only having mild issues and we can help with that quickly.";
	}

	if (score >= 34) {
		return "Not bad. You are having some stomach issues we'll clean up in no time.";
	}

	return "Your gut is very reactive. Don't stress, we'll raise your score in no time.";
}

const styles = StyleSheet.create({
	backgroundLayer: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	backgroundImage: {
		opacity: 1,
	},
	backgroundWash: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(19, 28, 26, 0.1)",
	},
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	backButton: {
		width: 38,
		height: 38,
		alignItems: "flex-start",
		justifyContent: "center",
	},
	progressTrack: {
		flex: 1,
		height: 10,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		borderRadius: 99,
		backgroundColor: palette.primary,
	},
	welcomeScene: {
		alignSelf: "center",
		width: "100%",
		maxWidth: 360,
		height: 248,
		alignItems: "center",
		justifyContent: "center",
		marginTop: spacing.sm,
		marginBottom: -spacing.md,
	},
	floatingAsset: {
		position: "absolute",
	},
	swirlLayer: {
		position: "absolute",
		left: -34,
		right: -34,
		top: -18,
		bottom: -8,
	},
	riceAsset: {
		left: 8,
		top: 56,
		width: 80,
		height: 80,
		transform: [{ rotate: "-8deg" }],
	},
	bananaAsset: {
		left: 72,
		top: 142,
		width: 72,
		height: 72,
		transform: [{ rotate: "-12deg" }],
	},
	carrotAsset: {
		left: 20,
		bottom: 4,
		width: 76,
		height: 76,
		transform: [{ rotate: "-18deg" }],
	},
	toastAsset: {
		right: 12,
		top: 134,
		width: 84,
		height: 84,
		transform: [{ rotate: "12deg" }],
	},
	plantOneAsset: {
		left: 76,
		top: 26,
		width: 42,
		height: 42,
		transform: [{ rotate: "-20deg" }],
	},
	plantTwoAsset: {
		right: 56,
		top: 72,
		width: 46,
		height: 46,
		transform: [{ rotate: "18deg" }],
	},
	plantThreeAsset: {
		right: 91,
		bottom: 23,
		width: 46,
		height: 46,
		transform: [{ rotate: "-8deg" }],
	},
	welcomeGif: {
		width: 150,
		height: 150,
	},
	imageBackgroundTitle: {
		textShadowColor: "rgba(64, 152, 119, 0.38)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	optionGrid: {
		gap: spacing.sm,
	},
	centerImageSlot: {
		flexGrow: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
	},
	centerImage: {
		borderRadius: 28,
	},
	centerGraphicSlot: {
		flexGrow: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.lg,
	},
	empathyGraphic: {
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
	},
	empathySceneCard: {
		width: "100%",
		height: 354,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	empathyPipHalo: {
		position: "absolute",
		left: 86,
		top: 82,
		width: 188,
		height: 188,
		borderRadius: 94,
		backgroundColor: tokens.color.status.success.background,
	},
	empathyPip: {
		position: "absolute",
		left: 89,
		top: 76,
		width: 182,
		height: 182,
		zIndex: 2,
	},
	empathyConcernCard: {
		position: "absolute",
		width: 116,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.frosted,
		alignItems: "center",
		justifyContent: "flex-start",
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: spacing.xs,
		gap: 0,
		...tokens.shadow.card,
		zIndex: 3,
	},
	empathyConcernTopLeft: {
		left: spacing.sm,
		top: spacing.md,
	},
	empathyConcernTopRight: {
		right: spacing.sm,
		top: spacing.md,
	},
	empathyConcernBottomLeft: {
		left: spacing.sm,
		bottom: spacing.md,
	},
	empathyConcernBottomRight: {
		right: spacing.sm,
		bottom: spacing.md,
	},
	empathyConcernIconSlot: {
		width: "100%",
		height: 88,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
	},
	empathyConcernIcon: {
		width: 142,
		height: 142,
	},
	empathyConcernText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
		paddingHorizontal: spacing.xs,
		paddingTop: spacing.xs,
	},
	promiseGraphic: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.md,
	},
	promiseHeroCard: {
		height: 206,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.frosted,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		...tokens.shadow.card,
	},
	promiseHeroGlow: {
		position: "absolute",
		width: 226,
		height: 126,
		borderRadius: 80,
		backgroundColor: tokens.color.status.success.background,
		bottom: 20,
	},
	promisePip: {
		width: 164,
		height: 164,
		marginTop: -spacing.sm,
	},
	promiseHeroAccent: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		bottom: spacing.md,
		minHeight: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.default,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.md,
	},
	promiseHeroAccentText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	promiseCardRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	promiseOutcomeCard: {
		flex: 1,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	promiseOutcomeIcon: {
		width: 72,
		height: 72,
		marginBottom: spacing.xs,
	},
	promiseOutcomeTitle: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 17,
		textAlign: "center",
	},
	promiseDividerMark: {
		width: 26,
		height: 2,
		borderRadius: 2,
		backgroundColor: tokens.color.accent.mascotAccent,
		marginVertical: 5,
	},
	promiseOutcomeBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 10,
		lineHeight: 13,
		textAlign: "center",
	},
	educationCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	educationScoreHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	educationEyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	educationCardTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	educationScoreValue: {
		fontFamily: type.body.bold,
		fontSize: 52,
		lineHeight: 58,
		fontVariant: ["tabular-nums"],
	},
	educationScoreScale: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 18,
		lineHeight: 22,
	},
	gutScoreScaleTrack: {
		height: 14,
		flexDirection: "row",
		gap: 3,
	},
	gutScoreScaleSegment: {
		flex: 1,
	},
	gutScoreScaleStart: {
		borderTopLeftRadius: 99,
		borderBottomLeftRadius: 99,
	},
	gutScoreScaleEnd: {
		borderTopRightRadius: 99,
		borderBottomRightRadius: 99,
	},
	scaleLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: -spacing.xs,
	},
	scaleEndpointLabel: {
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
	},
	educationSignalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		padding: spacing.md,
	},
	educationIconBadge: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	educationSignalText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 20,
	},
	phaseDiscoveryCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	phaseDiscoveryHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	phaseDiscoveryHeaderCopy: {
		flex: 1,
		gap: 2,
	},
	phaseDiscoveryTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	phaseDiscoveryStage: {
		minHeight: 268,
		justifyContent: "center",
	},
	discoveryScanCard: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	discoveryScanImage: {
		width: "100%",
		height: 268,
	},
	discoveryScanOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "space-between",
		padding: spacing.sm,
	},
	mealScanChip: {
		alignSelf: "flex-start",
		minHeight: 30,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 99,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		...tokens.shadow.card,
	},
	mealScanChipText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	scanReadyBadge: {
		alignSelf: "flex-end",
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	discoveryAnalyzingCard: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		padding: spacing.lg,
	},
	analyzingIconWrap: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	analyzingTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	analyzingBody: {
		maxWidth: 230,
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
		textAlign: "center",
	},
	analyzingDotRow: {
		flexDirection: "row",
		gap: 5,
		marginTop: spacing.xs,
	},
	analyzingDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: palette.primary,
	},
	analyzingDotMuted: {
		opacity: 0.32,
	},
	discoveryResultCard: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	resultHeaderRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	resultTitleStack: {
		flex: 1,
		gap: 2,
	},
	resultDishTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	resultScoreRow: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: spacing.md,
	},
	resultInsightCard: {
		flex: 1,
		justifyContent: "center",
		borderLeftWidth: 1,
		borderLeftColor: tokens.color.border.subtle,
		paddingLeft: spacing.md,
		gap: spacing.xs,
	},
	resultChipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	resultIngredientChip: {
		minHeight: 28,
		justifyContent: "center",
		borderRadius: 99,
		paddingHorizontal: spacing.sm,
	},
	resultIngredientChipHigh: {
		backgroundColor: tokens.color.status.risk.high.background,
	},
	resultIngredientChipMedium: {
		backgroundColor: tokens.color.status.risk.medium.background,
	},
	resultIngredientChipText: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	resultIngredientChipTextHigh: {
		color: tokens.color.status.risk.high.foreground,
	},
	resultIngredientChipTextMedium: {
		color: tokens.color.status.risk.medium.foreground,
	},
	adaptiveRiskPanel: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	adaptiveGaugeWrap: {
		width: 136,
		height: 124,
		alignItems: "center",
		justifyContent: "flex-start",
		marginLeft: -spacing.xs,
	},
	adaptiveGaugeValue: {
		color: tokens.color.status.risk.high.tint,
		fontFamily: type.body.bold,
		fontSize: 28,
		lineHeight: 31,
		fontVariant: ["tabular-nums"],
		marginTop: 3,
	},
	adaptiveGaugeLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
	},
	adaptiveRiskCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	highRiskPill: {
		alignSelf: "flex-start",
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.risk.high.background,
		paddingHorizontal: spacing.sm,
	},
	highRiskPillText: {
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	adaptiveRiskTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 21,
	},
	adaptiveRiskBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
	discoverySignalGrid: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	discoverySignal: {
		flex: 1,
		minHeight: 68,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.xs,
	},
	discoverySignalText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
	},
	phaseLimitationCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	phaseLimitationIllustration: {
		width: 92,
		height: 72,
		marginLeft: "auto",
	},
	limitationEvidencePanel: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	limitationEvidenceHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	limitationEvidenceTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	limitPlanBadge: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.risk.medium.background,
		paddingHorizontal: spacing.sm,
	},
	limitPlanBadgeText: {
		color: tokens.color.status.risk.medium.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	ingredientEvidenceStack: {
		gap: spacing.xs,
	},
	ingredientEvidenceRow: {
		minHeight: 61,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	ingredientEvidenceIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	ingredientEvidenceCopy: {
		flex: 1,
		gap: 2,
	},
	ingredientEvidenceTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
	},
	ingredientEvidenceBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	riskEvidencePill: {
		minHeight: 25,
		justifyContent: "center",
		borderRadius: 99,
		paddingHorizontal: spacing.sm,
	},
	riskEvidencePillText: {
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
	},
	limitationCallout: {
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	limitationCalloutIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	limitationCalloutText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	phaseReintroductionCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	reintroductionHeroIcon: {
		width: 68,
		height: 68,
		borderRadius: 24,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: "auto",
	},
	reintroductionPlanPanel: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	reintroductionPlanBadge: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
	},
	reintroductionPlanBadgeText: {
		color: tokens.color.status.risk.low.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	reintroductionCallout: {
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	scannerModesCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.sm,
		...tokens.shadow.card,
	},
	scannerModeRow: {
		minHeight: 128,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.xs,
	},
	scannerModeImageSlot: {
		width: 140,
		height: 116,
		alignItems: "center",
		justifyContent: "center",
	},
	scannerModeImage: {
		width: "100%",
		height: "100%",
	},
	scannerModeCopy: {
		flex: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	scannerModeIconBadge: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	scannerModeTextStack: {
		flex: 1,
		gap: spacing.xs,
		paddingTop: 2,
	},
	scannerModeTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	scannerModeBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
	},
	scannerModeDivider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
		marginHorizontal: spacing.md,
	},
	foodControlIntro: {
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	foodControlHeroCard: {
		width: "100%",
		height: 248,
		borderRadius: 34,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.74)",
		backgroundColor: "rgba(255,255,255,0.18)",
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: tokens.color.utility.shadow,
		shadowOpacity: 0.14,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 12 },
		elevation: 4,
	},
	foodControlGlassSheen: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(255,255,255,0.12)",
	},
	foodControlPip: {
		position: "absolute",
		top: 20,
		right: 100,
		width: 104,
		height: 104,
		zIndex: 4,
	},
	foodControlFloatingAsset: {
		position: "absolute",
		zIndex: 4,
	},
	foodControlRiceAsset: {
		left: 48,
		top: 48,
		width: 58,
		height: 58,
		transform: [{ rotate: "-8deg" }],
	},
	foodControlBananaAsset: {
		left: 102,
		top: 98,
		width: 50,
		height: 50,
		transform: [{ rotate: "-12deg" }],
	},
	foodControlCarrotAsset: {
		left: 35,
		bottom: 86,
		width: 52,
		height: 52,
		transform: [{ rotate: "-18deg" }],
	},
	foodControlToastAsset: {
		right: 52,
		top: 94,
		width: 56,
		height: 56,
		transform: [{ rotate: "12deg" }],
	},
	foodControlPlantOneAsset: {
		left: 100,
		top: 22,
		width: 30,
		height: 30,
		transform: [{ rotate: "-20deg" }],
	},
	foodControlPlantTwoAsset: {
		right: 67,
		top: 50,
		width: 31,
		height: 31,
		transform: [{ rotate: "18deg" }],
	},
	foodControlPlantThreeAsset: {
		right: 108,
		bottom: 103,
		width: 30,
		height: 30,
		transform: [{ rotate: "-8deg" }],
	},
	foodControlPill: {
		position: "absolute",
		bottom: 16,
		minHeight: 30,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.58)",
		backgroundColor: "rgba(91,166,135,0.84)",
		paddingHorizontal: spacing.lg,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 6,
	},
	foodControlPillText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	foodControlWord: {
		position: "absolute",
		bottom: 36,
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 68,
		lineHeight: 74,
		letterSpacing: 0,
		textShadowColor: "rgba(33,43,50,0.28)",
		textShadowOffset: { width: 0, height: 4 },
		textShadowRadius: 8,
		zIndex: 5,
	},
	foodControlSparkle: {
		position: "absolute",
		width: 7,
		height: 7,
		borderRadius: 4,
		backgroundColor: "rgba(255,255,255,0.86)",
		zIndex: 2,
	},
	foodControlSparkleOne: {
		left: 72,
		top: 100,
	},
	foodControlSparkleTwo: {
		right: 74,
		top: 142,
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	foodControlSparkleThree: {
		right: 132,
		bottom: 98,
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	foodControlMiniRow: {
		width: "100%",
		flexDirection: "row",
		alignItems: "stretch",
		justifyContent: "space-between",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	foodControlMiniCard: {
		flex: 1,
		minHeight: 102,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.38)",
		backgroundColor: "rgba(255,255,255,0.42)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		gap: spacing.xs,
		shadowColor: tokens.color.utility.shadow,
		shadowOpacity: 0.1,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 2,
	},
	foodControlMiniCardFeatured: {
		borderColor: tokens.color.border.emphasis,
		backgroundColor: tokens.color.surface.frosted,
		shadowOpacity: 0.16,
	},
	foodControlMiniRank: {
		position: "absolute",
		top: -13,
		left: -8,
		minWidth: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.86)",
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 3,
	},
	foodControlMiniRankText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	foodControlMiniIcon: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	foodControlMiniTitle: {
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 18,
		textAlign: "center",
	},
	foodControlMiniBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
	},
	foodLeverWrap: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.sm,
	},
	foodLeverHeroCard: {
		minHeight: 210,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
		borderRadius: 28,
		backgroundColor: tokens.color.surface.frosted,
		padding: spacing.md,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	foodLeverHeroContent: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		zIndex: 2,
	},
	foodLeverRankBadge: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverRankText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 28,
		lineHeight: 32,
	},
	foodLeverHeroCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	foodLeverHeroTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 30,
		lineHeight: 34,
	},
	foodLeverImpactRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: spacing.xs,
	},
	foodLeverImpactText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	foodLeverSubtext: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 17,
	},
	foodLeverHeroVisualWrap: {
		position: "absolute",
		right: -14,
		bottom: 20,
		width: 166,
		height: 126,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverImageHalo: {
		position: "absolute",
		right: 18,
		bottom: 8,
		width: 104,
		height: 104,
		borderRadius: 52,
		backgroundColor: tokens.color.status.success.background,
	},
	foodLeverFoodImage: {
		width: 170,
		height: 128,
	},
	foodLeverChoiceBadge: {
		position: "absolute",
		right: 12,
		top: -18,
		zIndex: 3,
		maxWidth: 118,
		minHeight: 36,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.xs,
		...tokens.shadow.card,
	},
	foodLeverChoiceText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 13,
	},
	foodLeverScaleBlock: {
		position: "absolute",
		left: spacing.md,
		bottom: spacing.md,
		width: 138,
		gap: spacing.xs,
	},
	foodLeverScaleTrack: {
		height: 10,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	foodLeverScaleFill: {
		width: "78%",
		height: "100%",
		borderRadius: 99,
		backgroundColor: palette.primary,
	},
	foodLeverScaleLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
	},
	foodLeverScaleLabel: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
	},
	foodLeverSecondaryCard: {
		minHeight: 68,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		...tokens.shadow.card,
	},
	foodLeverSecondaryRank: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverSecondaryRankText: {
		color: tokens.color.text.warm,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 24,
	},
	foodLeverSecondaryIcon: {
		width: 46,
		height: 46,
		borderRadius: 23,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverSecondaryCopy: {
		flex: 1,
		gap: 2,
	},
	foodLeverSecondaryTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 22,
	},
	foodLeverSecondaryBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 15,
	},
	foodLeverSecondaryMetric: {
		width: 88,
		gap: 4,
	},
	foodLeverMiniTrack: {
		height: 8,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	foodLeverMiniFill: {
		height: "100%",
		borderRadius: 99,
	},
	foodLeverMetricLabel: {
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 13,
	},
	foodLeverCallout: {
		minHeight: 46,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 23,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.md,
	},
	foodLeverCalloutIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	foodLeverCalloutText: {
		flex: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	healingLoopWrap: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.sm,
		position: "relative",
	},
	healingLoopConnector: {
		position: "absolute",
		left: 1,
		top: 20,
		zIndex: 0,
	},
	healingLoopRow: {
		minHeight: 78,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		zIndex: 1,
	},
	healingLoopBadge: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: palette.primary,
	},
	healingLoopBadgeText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	healingLoopCard: {
		flex: 1,
		minHeight: 78,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	healingLoopVisualSlot: {
		width: 64,
		height: 64,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	healingLoopImage: {
		width: 82,
		height: 82,
	},
	healingLoopCopy: {
		flex: 1,
		gap: 3,
	},
	healingLoopTitle: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	healingLoopBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	healingScoreVisual: {
		width: 66,
		height: 66,
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreRing: {
		width: 56,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreRingCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	healingScoreValue: {
		color: tokens.color.status.risk.low.foreground,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 18,
		fontVariant: ["tabular-nums"],
	},
	signalRow: {
		minHeight: 46,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.md,
	},
	signalRowText: {
		flex: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 21,
	},
	phaseGraphicCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.lg,
		...tokens.shadow.card,
	},
	phaseHeroRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	phaseNumberBadge: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	phaseNumber: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 26,
	},
	phaseIconWrap: {
		width: 64,
		height: 64,
		borderRadius: 26,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	phaseTitleWrap: {
		flex: 1,
	},
	phaseGraphicTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 24,
		lineHeight: 29,
	},
	phaseRows: {
		gap: spacing.sm,
	},
	customModalRoot: {
		flex: 1,
		backgroundColor: "rgba(22, 29, 33, 0.44)",
	},
	customModalBackdrop: {
		...StyleSheet.absoluteFillObject,
		zIndex: 0,
	},
	customModalKeyboard: {
		flex: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		padding: spacing.lg,
		zIndex: 1,
	},
	customModalCard: {
		width: "100%",
		maxWidth: 380,
		zIndex: 2,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.sheet,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.modal,
	},
	customModalHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	customModalTitleWrap: {
		flex: 1,
		gap: spacing.xs,
	},
	customModalTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	customModalSubtitle: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	customModalClose: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	customOptionStack: {
		gap: spacing.sm,
	},
	customValuePill: {
		minHeight: 50,
		borderRadius: 18,
		backgroundColor: palette.primary,
		paddingHorizontal: spacing.md,
		paddingVertical: 13,
		paddingRight: 42,
		justifyContent: "center",
		position: "relative",
	},
	customValueText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 20,
	},
	customValueRemove: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	previewStack: {
		gap: spacing.md,
	},
	previewCard: {
		gap: spacing.sm,
	},
	previewTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 17,
	},
	previewBody: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 15,
		lineHeight: 21,
		textAlign: "center",
	},
	previewNote: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	metricRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	startingScoreCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		alignItems: "center",
		gap: spacing.md,
		...tokens.shadow.card,
	},
	startingScoreHeader: {
		width: "100%",
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	startingScoreTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 24,
	},
	startingScoreStatusPill: {
		minHeight: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	startingScoreStatusText: {
		color: tokens.color.status.success.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	startingScoreRingWrap: {
		width: 150,
		height: 150,
		alignItems: "center",
		justifyContent: "center",
	},
	startingScoreCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	startingScoreValue: {
		fontFamily: type.body.bold,
		fontSize: 46,
		lineHeight: 52,
		letterSpacing: -1.5,
		fontVariant: ["tabular-nums"],
	},
	startingScoreDotRow: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	startingScoreLoadingDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	startingScoreCenterLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
	},
	startingScoreChecklist: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	startingScoreCheckRow: {
		width: "48%",
		minHeight: 32,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.xs,
	},
	startingScoreCheckIcon: {
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: tokens.color.chart.track,
		alignItems: "center",
		justifyContent: "center",
	},
	startingScoreCheckIconComplete: {
		backgroundColor: palette.primary,
	},
	startingScoreCheckText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
	},
	startingScoreCheckTextComplete: {
		color: tokens.color.text.primary,
	},
	startingScoreHint: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
		textAlign: "center",
	},
	startingScoreResultPanel: {
		width: "100%",
		borderRadius: 20,
		backgroundColor: tokens.color.status.success.background,
		padding: spacing.md,
	},
	startingScoreResultText: {
		color: tokens.color.text.primary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 21,
		textAlign: "center",
	},
	planCard: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	planCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	footer: {
		marginTop: "auto",
	},
	footerBody: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 17,
		lineHeight: 25,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	footerBodyOnImage: {
		color: "rgba(255, 255, 255, 0.9)",
		textShadowColor: "rgba(64, 152, 119, 0.28)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 2,
	},
});

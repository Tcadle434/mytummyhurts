import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import {
	Image,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";

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
import { onboardingSteps } from "../../data/onboarding";
import { trackEvent } from "../../services/analytics";
import { computeGutScoreState } from "../../services/ai/scoring";
import { useAppStore } from "../../store/useAppStore";
import { palette, spacing, tokens, type } from "../../theme";
import { OnboardingStackParamList } from "../../navigation/types";
import {
	StartingGutScoreComputeCard,
	type StartingScoreState,
} from "./components/StartingGutScoreComputeCard";
import { RaiseGutScorePlanPreview } from "./components/RaiseGutScorePlanPreview";
import { WelcomeFoodScene } from "./components/WelcomeFoodScene";
import { type PhaseDiscoveryState } from "./components/PhaseDiscoveryGraphic";
import { OnboardingCenterGraphic } from "./components/OnboardingCenterGraphic";

type Props = NativeStackScreenProps<OnboardingStackParamList, "OnboardingFlow">;
type IoniconName = ComponentProps<typeof Ionicons>["name"];

const GET_STARTED_BACKGROUND_IMAGE = require("../../../assets/get_started_background_image.png");
const GUT_ISSUES_DIAGRAM = require("../../../assets/ui/gut_issues_diagram.png");

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
	const [startingScoreState, setStartingScoreState] = useState<StartingScoreState>("ready");
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
	const isPhaseDiscoveryStep = step.id === "phase-discovery";
	const isStartingScoreStep = step.id === "gut-score-analyzing";
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
				return <RaiseGutScorePlanPreview />;
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

			{step.centerGraphic ? (
				<View style={styles.centerGraphicSlot}>
					<OnboardingCenterGraphic
						centerGraphic={step.centerGraphic}
						phaseDiscoveryState={phaseDiscoveryState}
					/>
				</View>
			) : null}

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

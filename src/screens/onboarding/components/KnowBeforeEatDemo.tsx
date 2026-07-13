import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PipAnalysisCard } from "../../../components/common/UI";
import { RiskBar } from "../../../components/charts/RiskBar";
import {
	IngredientsBreakdownCard,
	MenuTierCard,
	RiskHeroCard,
	type MenuTierItem,
	type RiskLevel,
	type ScanIngredient,
	toggleExpandedId,
} from "../../../components/scan-result/ScanResultCards";
import { palette, spacing, tokens, type } from "../../../theme";
import { AnalyzingView, ScannerImageView } from "./KnowBeforeEatScanningViews";

export type KnowBeforeEatStage =
	| "menu-scan"
	| "menu-loading"
	| "menu-result"
	| "food-scan"
	| "food-loading"
	| "food-result"
	| "barcode-scan"
	| "barcode-loading"
	| "barcode-result";

const MENU_IMAGE = require("../../../../assets/ui/menu_scanning_onboarding.png");
const MEAL_IMAGE = require("../../../../assets/ui/meal_scanning_onboarding.png");
const BARCODE_IMAGE = require("../../../../assets/ui/barcode_scanning_onboarding.png");

type MenuItem = {
	name: string;
	score: number;
	level: RiskLevel;
	reason: string;
	insight: string;
	triggers?: string[];
	saferSwap?: string;
};

const MENU_BEST: MenuItem[] = [
	{
		name: "Grilled chicken fajitas",
		score: 24,
		level: "low",
		reason: "Lean protein, mild seasoning",
		insight:
			"Plain grilled chicken keeps fat low and avoids common reflux triggers. Skip the sour cream and you keep dairy out of the picture.",
		saferSwap: "Ask for corn tortillas, no sour cream",
	},
	{
		name: "Pollo asado bowl",
		score: 28,
		level: "low",
		reason: "Plain proteins, low-FODMAP base",
		insight:
			"Rice + lettuce is one of the gentlest bases on a Mexican menu. The lime marinade is mild and the chicken stays lean.",
		saferSwap: "Hold the beans to keep FODMAPs low",
	},
	{
		name: "Caldo de pollo",
		score: 32,
		level: "low",
		reason: "Gentle, hydrating, no fried elements",
		insight:
			"Brothy soups are easy on a sensitive gut — no frying, and the vegetables are usually cooked soft.",
	},
];

const MENU_CAUTION: MenuItem[] = [
	{
		name: "Chicken quesadilla",
		score: 52,
		level: "medium",
		reason: "Cheese can trigger reflux",
		insight:
			"Melted cheese is heavier and slower to digest, which can push reflux. The flour tortilla also adds gluten if that's an issue.",
		triggers: ["Cheese", "Flour tortilla"],
		saferSwap: "Ask for corn tortilla and light cheese",
	},
	{
		name: "Carnitas tacos (corn)",
		score: 56,
		level: "medium",
		reason: "Slow-cooked pork is fattier",
		insight:
			"Carnitas is rich and fatty by design. Two tacos is usually manageable; corn tortillas keep it lighter than a burrito.",
		triggers: ["Pork fat"],
	},
	{
		name: "Beef burrito bowl",
		score: 58,
		level: "medium",
		reason: "Beans add FODMAPs",
		insight:
			"Beef is fine in moderation, but black or pinto beans are common IBS triggers. Sub for extra rice or fajita veggies.",
		triggers: ["Black beans"],
		saferSwap: "Sub beans for fajita veggies",
	},
];

const MENU_AVOID: MenuItem[] = [
	{
		name: "Chiles rellenos",
		score: 92,
		level: "high",
		reason: "Fried batter, cheese, capsaicin",
		insight:
			"Triple-trouble: deep-fried batter slows digestion, melted cheese stresses reflux, and chili pepper hits both reflux and IBS at once.",
		triggers: ["Fried", "Dairy", "Capsaicin"],
		saferSwap: "Try grilled chicken fajitas instead",
	},
	{
		name: "Enchiladas rojas",
		score: 86,
		level: "high",
		reason: "Chili sauce, dairy, tomato",
		insight:
			"Red chili sauce packs capsaicin and tomato — both top-3 reflux triggers. Add melted cheese and it's tough for a sensitive stomach.",
		triggers: ["Tomato", "Chili", "Cheese"],
	},
	{
		name: "Carne asada nachos",
		score: 81,
		level: "high",
		reason: "Fried chips, dairy, beans",
		insight:
			"Fried chips + melted cheese + beans hit reflux, IBS, and FODMAPs all on one plate. Hard to recommend even in small portions.",
		triggers: ["Fried", "Cheese", "Beans"],
	},
];

type ConditionImpact = {
	name: string;
	score: number;
	level: RiskLevel;
};

const FOOD_RESULT = {
	dish: "Carne asada tacos",
	score: 64,
	level: "medium" as RiskLevel,
	conditions: [
		{ name: "IBS", score: 71, level: "high" as RiskLevel },
		{ name: "Acid reflux", score: 60, level: "medium" as RiskLevel },
	] satisfies ConditionImpact[],
	ingredients: [
		{ name: "Corn tortilla", level: "low" as RiskLevel },
		{
			name: "Carne asada (grilled beef)",
			level: "medium" as RiskLevel,
		},
		{ name: "White onion", level: "high" as RiskLevel },
		{ name: "Cilantro", level: "low" as RiskLevel },
		{ name: "Lime", level: "medium" as RiskLevel },
		{
			name: "Salsa roja",
			level: "high" as RiskLevel,
		},
	] satisfies ScanIngredient[],
	pip: "Tacos are a mixed bag for your gut. Onion and salsa roja are the biggest red flags. Asking for no onion and a milder salsa verde could drop the risk by about 20 points.",
};

const BARCODE_RESULT = {
	product: "Barilla Penne",
	score: 22,
	level: "low" as RiskLevel,
	conditions: [
		{ name: "IBS", score: 46, level: "medium" as RiskLevel },
		{ name: "Acid reflux", score: 22, level: "low" as RiskLevel },
	] satisfies ConditionImpact[],
	ingredients: [
		{
			name: "Semolina (wheat)",
			level: "medium" as RiskLevel,
		},
		{
			name: "Durum wheat flour",
			level: "medium" as RiskLevel,
		},
		{ name: "Niacin (vitamin B3)", level: "low" as RiskLevel },
		{
			name: "Iron (ferrous sulfate)",
			level: "low" as RiskLevel,
		},
		{ name: "Thiamine mononitrate (B1)", level: "low" as RiskLevel },
		{ name: "Riboflavin (B2)", level: "low" as RiskLevel },
		{ name: "Folic acid", level: "low" as RiskLevel },
	] satisfies ScanIngredient[],
	pip: "Plain pasta is one of the gentlest packaged foods for a sensitive stomach — no fat, no acid, no spice. Wheat is the only thing to watch if bread or pizza has bothered you before. Pair it with a low-FODMAP sauce and most people do fine.",
};

type Props = {
	stage: KnowBeforeEatStage;
	imageHeight: number;
};

export function KnowBeforeEatDemo({ stage, imageHeight }: Props) {
	switch (stage) {
		case "menu-scan":
			return (
				<ScannerImageView
					source={MENU_IMAGE}
					imageHeight={imageHeight}
					headline="Scan a menu"
				/>
			);
		case "menu-loading":
			return <AnalyzingView label="Analyzing menu…" />;
		case "menu-result":
			return <MenuResultView />;
		case "food-scan":
			return (
				<ScannerImageView
					source={MEAL_IMAGE}
					imageHeight={imageHeight}
					headline="Scan your meal"
				/>
			);
		case "food-loading":
			return <AnalyzingView label="Analyzing your meal…" />;
		case "food-result":
			return <FoodResultView />;
		case "barcode-scan":
			return (
				<ScannerImageView
					source={BARCODE_IMAGE}
					imageHeight={imageHeight}
					headline="Scan a grocery item"
				/>
			);
		case "barcode-loading":
			return <AnalyzingView label="Reading ingredient list…" />;
		case "barcode-result":
			return <BarcodeResultView />;
		default:
			return null;
	}
}

function MenuResultView() {
	const [expanded, setExpanded] = useState<string | null>(null);

	function toggle(id: string) {
		toggleExpandedId(expanded, id, setExpanded);
	}

	return (
		<View style={styles.resultStack}>
			<MenuTierCard
				title="Best for you"
				level="low"
				items={MENU_BEST.map(toMenuTierItem)}
				expandedId={expanded}
				onToggle={toggle}
			/>
			<MenuTierCard
				title="Eat with caution"
				level="medium"
				items={MENU_CAUTION.map(toMenuTierItem)}
				expandedId={expanded}
				onToggle={toggle}
			/>
			<MenuTierCard
				title="Try to avoid"
				level="high"
				items={MENU_AVOID.map(toMenuTierItem)}
				expandedId={expanded}
				onToggle={toggle}
			/>
		</View>
	);
}

function toMenuTierItem(item: MenuItem): MenuTierItem {
	return {
		id: item.name,
		name: item.name,
		score: item.score,
		level: item.level,
		reason: item.reason,
		insight: item.insight,
		triggers: item.triggers,
		saferSwap: item.saferSwap,
	};
}

function FoodResultView() {
	return (
		<View style={styles.resultStack}>
			<RiskHeroCard
				eyebrow="Meal scanned"
				title={FOOD_RESULT.dish}
				score={FOOD_RESULT.score}
				level={FOOD_RESULT.level}
			/>
			<ConditionsImpactCard conditions={FOOD_RESULT.conditions} />
			<IngredientsBreakdownCard ingredients={FOOD_RESULT.ingredients} />
			<PipAnalysisCard body={FOOD_RESULT.pip} />
		</View>
	);
}

function BarcodeResultView() {
	return (
		<View style={styles.resultStack}>
			<RiskHeroCard
				eyebrow="Barcode scanned"
				title={BARCODE_RESULT.product}
				score={BARCODE_RESULT.score}
				level={BARCODE_RESULT.level}
			/>
			<ConditionsImpactCard conditions={BARCODE_RESULT.conditions} />
			<IngredientsBreakdownCard ingredients={BARCODE_RESULT.ingredients} />
			<PipAnalysisCard body={BARCODE_RESULT.pip} />
		</View>
	);
}

function ConditionsImpactCard({ conditions }: { conditions: ConditionImpact[] }) {
	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>How this affects your conditions (example)</Text>
			<View style={styles.conditionsList}>
				{conditions.map((condition) => (
					<RiskBar
						key={condition.name}
						label={condition.name}
						score={condition.score}
						level={condition.level}
					/>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	resultStack: {
		gap: spacing.md,
	},
	resultCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	cardHeaderIcon: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: tokens.color.surface.card.success,
		alignItems: "center",
		justifyContent: "center",
	},
	cardHeaderText: {
		flex: 1,
		gap: 2,
	},
	kicker: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	sectionLabel: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	tierHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	tierTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	menuRows: {
		gap: spacing.sm,
	},
	menuRow: {
		borderRadius: 20,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
	},
	menuRowPressed: {
		opacity: 0.88,
	},
	menuRowTop: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		minHeight: 56,
	},
	menuRowBody: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	expandedBlock: {
		gap: spacing.sm,
		paddingTop: spacing.xs,
	},
	insightLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	insightBody: {
		color: palette.text,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	triggerChipsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	saferSwapRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
		borderRadius: 14,
		backgroundColor: tokens.color.surface.card.success,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	saferSwapText: {
		flex: 1,
		color: palette.primaryDark,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	menuName: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	menuReason: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
	scorePill: {
		minWidth: 48,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		paddingHorizontal: spacing.sm,
		backgroundColor: tokens.color.surface.card.default,
	},
	scorePillText: {
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	conditionsList: {
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
});

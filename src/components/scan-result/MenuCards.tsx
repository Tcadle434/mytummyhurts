import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorForLevel, prioritizeScoreContributors, type MenuTierItem, type RiskLevel } from "./common";
import { buildIngredientHistoryModel } from "./PersonalizedScanCard.helpers";
import { DietEvaluationRows, IngredientHistoryRows } from "./PersonalizedScanCard";
import { PortionChoiceRow } from "./PortionChoice";
import { ScoreDriversList } from "./ScoreDrivers";
import { resultCardStyle, sectionLabelStyle } from "./styles";
import { InfoPill, VerdictPill, type VerdictToneKey } from "../common/UI";
import { DEFAULT_PORTION } from "../../features/scan/consumptionPortions";
import { palette, spacing, tokens, type } from "../../theme";
import type { ConsumptionPortion } from "../../types/domain";

// "I ordered this" taps and portion-chip taps share one callback: portion is
// omitted on the initial log (the handler applies the normal default).
export type MenuItemConsumeHandler = (item: MenuTierItem, portion?: ConsumptionPortion) => void;

const MIN_TOUCH_TARGET = 44;

// Menu items speak in words on the scan line — a worded tone pill ("Low
// risk"), never a raw score. The number still exists; it moves into the
// expanded detail where its scale (/100) and direction (lower = easier) can
// ride along with it.
const RISK_TONE_KEY: Record<RiskLevel, VerdictToneKey> = {
	low: "safe",
	medium: "suspect",
	high: "confirmed",
};

export function riskToneKeyForLevel(level: RiskLevel): VerdictToneKey {
	return RISK_TONE_KEY[level];
}

export function riskLevelLabel(level: RiskLevel): string {
	if (level === "high") return "High risk";
	if (level === "medium") return "Medium risk";
	return "Low risk";
}

// The eyebrow stays honest: the #1-ranked dish only gets celebrated as a best
// bet when it actually reads low risk. Otherwise it is the gentlest of a
// rough menu, and the copy says so.
function topPickEyebrow(level: RiskLevel): string {
	if (level === "low") return "Your best bet";
	if (level === "medium") return "Gentlest option here";
	return "Gentlest option — still risky";
}

// The answer to "what do I order?" — the menu screen's one evergreen hero.
// The top-ranked dish sits on the deep garden surface with porcelain text;
// the worded tone pill carries the risk state, and the honest eyebrow keeps
// a rough menu's "gentlest option" from reading like a celebration. The
// expanded breakdown drops onto a white inset so the light-ramp evidence
// components keep their contrast.
export function MenuTopPickCard({
	item,
	expanded,
	onToggle,
	onConsume,
}: {
	item: MenuTierItem;
	expanded: boolean;
	onToggle: () => void;
	onConsume?: MenuItemConsumeHandler;
}) {
	const meta = [item.section, item.price].filter(Boolean).join(" • ");
	return (
		<View style={styles.topPickCard}>
			<View style={styles.topPickHeader}>
				<View style={styles.topPickEyebrowRow}>
					<Text style={styles.topPickEyebrow}>{topPickEyebrow(item.level)}</Text>
					<VerdictPill
						label={riskLevelLabel(item.level)}
						tone={riskToneKeyForLevel(item.level)}
						size="sm"
					/>
				</View>
				<Text style={styles.topPickName}>{item.name}</Text>
				{meta ? <Text style={styles.topPickMeta}>{meta}</Text> : null}
			</View>
			<Text style={styles.topPickWhy}>{item.reason}</Text>
			{onConsume ? (
				<View style={styles.topPickConsume}>
					<ConsumeMenuItemButton item={item} onConsume={onConsume} onHero />
					{!item.consumed ? (
						<Text style={styles.consumeHint}>
							Logging what you order counts toward your triggers.
						</Text>
					) : null}
				</View>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				onPress={onToggle}
				style={({ pressed }) => [styles.breakdownToggle, pressed && styles.pressedDim]}
			>
				<Text style={styles.breakdownToggleLabel}>
					{expanded ? "Hide the breakdown" : "See the full breakdown"}
				</Text>
				<Ionicons
					name={expanded ? "chevron-up" : "chevron-down"}
					size={16}
					color={tokens.color.accent.mascot}
				/>
			</Pressable>
			{expanded ? (
				<View style={styles.topPickDetailsInset}>
					<MenuItemDetails item={item} />
				</View>
			) : null}
		</View>
	);
}

// A worded, toned band: Bricolage title in the band's risk foreground over a
// stack of plain rows on the canvas — the same section idiom the trigger
// profile uses, so grouped verdict-ish content reads the same everywhere.
export function MenuBandSection({
	title,
	subtitle,
	level,
	items,
	expandedId,
	onToggle,
	onConsume,
}: {
	title: string;
	subtitle?: string;
	level: RiskLevel;
	items: MenuTierItem[];
	expandedId: string | null;
	onToggle: (id: string) => void;
	onConsume?: MenuItemConsumeHandler;
}) {
	if (items.length === 0) {
		return null;
	}
	const tone = tokens.color.status.risk[level];
	return (
		<View style={styles.bandSection}>
			<View style={styles.bandHeader}>
				<View style={styles.bandTitleRow}>
					<Text style={[styles.bandTitle, { color: tone.foreground }]}>{title}</Text>
					<Text style={styles.bandCount}>{items.length}</Text>
				</View>
				{subtitle ? <Text style={styles.bandSubtitle}>{subtitle}</Text> : null}
			</View>
			<View style={styles.menuRows}>
				{items.map((item) => (
					<MenuRow
						key={item.id}
						item={item}
						onConsume={onConsume}
						expanded={expandedId === item.id}
						onToggle={() => onToggle(item.id)}
					/>
				))}
			</View>
		</View>
	);
}

export function MenuTierCard({
	title,
	level,
	items,
	expandedId,
	onToggle,
}: {
	title: string;
	level: RiskLevel;
	items: MenuTierItem[];
	expandedId: string | null;
	onToggle: (id: string) => void;
}) {
	if (items.length === 0) {
		return null;
	}
	const tone = tokens.color.status.risk[level];
	return (
		<View style={resultCardStyle}>
			<View style={styles.tierHeader}>
				<Ionicons name="checkmark-circle" size={22} color={tone.tint} />
				<Text style={[styles.tierTitle, { color: tone.foreground }]}>{title}</Text>
			</View>
			<View style={styles.menuRows}>
				{items.map((item) => (
					<MenuRow
						key={item.id}
						item={item}
						expanded={expandedId === item.id}
						onToggle={() => onToggle(item.id)}
					/>
				))}
			</View>
		</View>
	);
}

function MenuRow({
	item,
	expanded,
	onToggle,
	onConsume,
}: {
	item: MenuTierItem;
	expanded: boolean;
	onToggle: () => void;
	onConsume?: MenuItemConsumeHandler;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ expanded }}
			onPress={onToggle}
			style={({ pressed }) => [styles.menuRow, pressed && styles.pressedDim]}
		>
			<View style={styles.menuRowTop}>
				<View style={styles.menuRowBody}>
					{item.section || item.price ? (
						<Text style={styles.menuMeta}>
							{[item.section, item.price].filter(Boolean).join(" • ")}
						</Text>
					) : null}
					<View style={styles.menuNameRow}>
						{item.consumed ? (
							<Ionicons
								name="checkmark-circle"
								size={15}
								color={tokens.color.status.risk.low.foreground}
							/>
						) : null}
						<Text style={styles.menuName}>{item.name}</Text>
					</View>
					<Text style={styles.menuReason} numberOfLines={expanded ? undefined : 2}>
						{item.reason}
					</Text>
				</View>
				<View style={styles.menuRowTrailing}>
					<VerdictPill
						label={riskLevelLabel(item.level)}
						tone={riskToneKeyForLevel(item.level)}
						size="sm"
					/>
					<View style={styles.detailsCue}>
						<Text style={styles.detailsCueLabel}>{expanded ? "Hide" : "Details"}</Text>
						<Ionicons
							name={expanded ? "chevron-up" : "chevron-down"}
							size={14}
							color={palette.textMuted}
						/>
					</View>
				</View>
			</View>
			{expanded ? <MenuItemDetails item={item} onConsume={onConsume} /> : null}
		</Pressable>
	);
}

function MenuItemDetails({
	item,
	onConsume,
}: {
	item: MenuTierItem;
	onConsume?: MenuItemConsumeHandler;
}) {
	const tone = tokens.color.status.risk[item.level];
	const scoreDrivers = prioritizeScoreContributors(item.scoreContributors, 4);
	const ingredientHistoryRows = buildIngredientHistoryModel(item.ingredientRisks, 3).rows;
	return (
		<View style={styles.detailsBlock}>
			<View style={styles.detailsSection}>
				<Text style={sectionLabelStyle}>Why this score</Text>
				<View
					style={styles.scoreLine}
					accessible
					accessibilityLabel={`Risk score ${item.score} out of 100. Lower is easier on your gut.`}
				>
					<Text style={[styles.scoreValue, { color: tone.foreground }]}>{item.score}</Text>
					<Text style={styles.scoreUnit}>/100</Text>
					<Text style={styles.scoreCaption}>lower is easier on your gut</Text>
				</View>
				{item.insight ? <Text style={styles.insightBody}>{item.insight}</Text> : null}
			</View>
			{item.triggers && item.triggers.length > 0 ? (
				<View style={styles.triggerChipsRow}>
					{item.triggers.map((trigger) => (
						<InfoPill key={trigger} label={trigger} tone="warm" />
					))}
				</View>
			) : null}
			{scoreDrivers.length > 0 ? (
				<ScoreDriversList contributors={scoreDrivers} accentColor={colorForLevel(item.level)} />
			) : null}
			{item.dietEvaluations && item.dietEvaluations.length > 0 ? (
				<View style={styles.detailsSection}>
					<Text style={sectionLabelStyle}>Diet fit</Text>
					<DietEvaluationRows evaluations={item.dietEvaluations} />
				</View>
			) : null}
			{ingredientHistoryRows.length > 0 ? (
				<View style={styles.detailsSection}>
					<Text style={sectionLabelStyle}>Ingredient history</Text>
					<IngredientHistoryRows rows={ingredientHistoryRows} />
				</View>
			) : null}
			{item.saferSwap ? (
				<View style={styles.saferSwapRow}>
					<Ionicons name="chatbubble-ellipses-outline" size={16} color={palette.primary} />
					<Text style={styles.saferSwapText}>{item.saferSwap}</Text>
				</View>
			) : null}
			{onConsume ? <ConsumeMenuItemButton item={item} onConsume={onConsume} /> : null}
		</View>
	);
}

// "I ordered this" is the input that feeds trigger learning, so it reads as a
// real button — full width, comfortable target — and the done state says what
// the tap earned. Once logged, the portion chips appear in place (Phase 4):
// normal is preselected, so ignoring them costs nothing.
function ConsumeMenuItemButton({
	item,
	onConsume,
	onHero = false,
}: {
	item: MenuTierItem;
	onConsume: MenuItemConsumeHandler;
	onHero?: boolean;
}) {
	const done = Boolean(item.consumed);
	return (
		<View style={styles.consumeStack}>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ disabled: done }}
				accessibilityLabel={
					done ? `${item.name} logged — counts toward your triggers` : `I ordered this: ${item.name}`
				}
				disabled={done}
				onPress={() => onConsume(item)}
				style={({ pressed }) => [
					styles.consumeButton,
					onHero && styles.consumeButtonOnHero,
					done && styles.consumeButtonDone,
					pressed && !done && styles.pressedDim,
				]}
			>
				<Ionicons
					name={done ? "checkmark-circle" : "restaurant-outline"}
					size={16}
					color={done ? tokens.color.status.risk.low.foreground : tokens.color.action.quiet.foreground}
				/>
				<Text style={[styles.consumeButtonText, done && styles.consumeButtonTextDone]}>
					{done ? "Logged — counts toward your triggers" : "I ordered this"}
				</Text>
			</Pressable>
			{done ? (
				<PortionChoiceRow
					value={item.portion ?? DEFAULT_PORTION}
					onSelect={(portion) => onConsume(item, portion)}
					onHero={onHero}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	pressedDim: {
		opacity: 0.88,
	},
	// --- top-pick spotlight (the menu screen's evergreen hero) ---
	topPickCard: {
		width: "100%",
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface.hero.background,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.lift,
	},
	topPickHeader: {
		gap: tokens.space.xxs,
	},
	topPickEyebrowRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	// Pip's mint is the accent that glows against the evergreen.
	topPickEyebrow: {
		...tokens.type.label.eyebrow,
		fontFamily: type.body.semibold,
		textTransform: "uppercase",
		color: tokens.color.accent.mascot,
		flexShrink: 1,
	},
	topPickName: {
		...tokens.type.display.section,
		color: tokens.color.surface.hero.onHero,
	},
	topPickMeta: {
		...tokens.type.label.metric,
		color: tokens.color.surface.hero.onHeroFaint,
	},
	topPickWhy: {
		...tokens.type.body.emphasis,
		color: tokens.color.surface.hero.onHeroMuted,
	},
	topPickConsume: {
		gap: spacing.xs,
	},
	consumeHint: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.surface.hero.onHeroMuted,
	},
	breakdownToggle: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		gap: tokens.space.xxs,
		minHeight: MIN_TOUCH_TARGET,
	},
	breakdownToggleLabel: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.accent.mascot,
	},
	// White receipt inset: the expanded evidence keeps its light-ramp contrast
	// instead of restyling every evidence component for the dark surface.
	topPickDetailsInset: {
		borderRadius: tokens.radius.lg,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
	},
	// --- worded bands ---
	bandSection: {
		gap: spacing.sm,
	},
	bandHeader: {
		gap: tokens.space.xxs,
		paddingHorizontal: spacing.xs,
	},
	bandTitleRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: spacing.xs,
	},
	bandTitle: {
		...tokens.type.display.accent,
		flex: 1,
	},
	bandCount: {
		...tokens.type.body.small,
		fontFamily: type.body.bold,
		color: tokens.color.text.tertiary,
	},
	bandSubtitle: {
		...tokens.type.label.metric,
		color: tokens.color.text.tertiary,
	},
	menuRows: {
		gap: spacing.sm,
	},
	// --- onboarding tier card ---
	tierHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	tierTitle: {
		...tokens.type.display.accent,
	},
	// --- rows ---
	// Borderless: white rows lift off the porcelain band on the soft
	// green-cast shadow, matching the card system.
	menuRow: {
		borderRadius: tokens.radius.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
		...tokens.shadow.card,
	},
	menuRowTop: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		minHeight: MIN_TOUCH_TARGET,
	},
	menuRowBody: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	menuNameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: tokens.space.xxs,
	},
	menuMeta: {
		...tokens.type.label.eyebrow,
		fontFamily: type.body.semibold,
		color: tokens.color.text.tertiary,
		textTransform: "uppercase",
	},
	menuName: {
		...tokens.type.body.strong,
		fontFamily: type.body.bold,
		color: tokens.color.text.primary,
		flexShrink: 1,
	},
	menuReason: {
		...tokens.type.body.small,
		color: tokens.color.text.secondary,
	},
	menuRowTrailing: {
		alignItems: "flex-end",
		gap: spacing.xs,
	},
	detailsCue: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
	},
	detailsCueLabel: {
		...tokens.type.label.metric,
		color: tokens.color.text.tertiary,
	},
	// --- expanded detail ---
	detailsBlock: {
		gap: spacing.sm,
		paddingTop: spacing.xs,
	},
	detailsSection: {
		gap: spacing.xs,
	},
	scoreLine: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: tokens.space.xxs,
	},
	scoreValue: {
		...tokens.type.display.accent,
	},
	scoreUnit: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.text.tertiary,
		paddingBottom: 2,
	},
	scoreCaption: {
		...tokens.type.body.small,
		color: tokens.color.text.tertiary,
		paddingBottom: 2,
		marginLeft: tokens.space.xxs,
	},
	insightBody: {
		...tokens.type.body.small,
		color: tokens.color.text.primary,
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
		borderRadius: tokens.radius.sm,
		backgroundColor: tokens.color.surface.card.success,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	saferSwapText: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		flex: 1,
		color: palette.primaryDark,
	},
	// --- consumption affordance ---
	consumeStack: {
		gap: spacing.xs,
	},
	consumeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		minHeight: MIN_TOUCH_TARGET,
		borderRadius: tokens.radius.pill,
		backgroundColor: tokens.color.action.quiet.background,
		paddingHorizontal: spacing.md,
	},
	// On the evergreen hero the button reads as a solid white pill — no
	// hairline needed against the dark surface.
	consumeButtonOnHero: {
		backgroundColor: tokens.color.surface.card.default,
	},
	consumeButtonDone: {
		backgroundColor: tokens.color.status.risk.low.background,
	},
	consumeButtonText: {
		...tokens.type.label.chip,
		color: tokens.color.action.quiet.foreground,
	},
	consumeButtonTextDone: {
		color: tokens.color.status.risk.low.foreground,
	},
});

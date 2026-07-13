import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorForLevel, prioritizeScoreContributors, type MenuTierItem } from "./common";
import { buildIngredientHistoryModel } from "./PersonalizedScanCard.helpers";
import { DietEvaluationRows, IngredientHistoryRows } from "./PersonalizedScanCard";
import { PortionChoiceRow } from "./PortionChoice";
import { ScoreDriversList } from "./ScoreDrivers";
import { sectionLabelStyle } from "./styles";
import { InfoPill } from "../common/UI";
import { DEFAULT_PORTION } from "../../features/scan/consumptionPortions";
import { palette, spacing, tokens, type } from "../../theme";
import type { ConsumptionPortion } from "../../types/domain";

// "I ordered this" taps and portion-chip taps share one callback: portion is
// omitted on the initial log (the handler applies the normal default).
export type MenuItemConsumeHandler = (item: MenuTierItem, portion?: ConsumptionPortion) => void;

const MIN_TOUCH_TARGET = 44;

export function MenuItemDetails({
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
// real button - full width, comfortable target - and the done state says what
// the tap earned. Once logged, the portion chips appear in place (Phase 4):
// normal is preselected, so ignoring them costs nothing.
export function ConsumeMenuItemButton({
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
					done
						? `${item.name} logged \u2014 counts toward your triggers`
						: `I ordered this: ${item.name}`
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
					color={
						done ? tokens.color.status.risk.low.foreground : tokens.color.action.quiet.foreground
					}
				/>
				<Text style={[styles.consumeButtonText, done && styles.consumeButtonTextDone]}>
					{done ? "Logged \u2014 counts toward your triggers" : "I ordered this"}
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
	consumeButtonOnHero: {
		backgroundColor: tokens.color.action.quiet.background,
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

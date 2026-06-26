import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colorForLevel, prioritizeScoreContributors, type MenuTierItem, type RiskLevel } from "./common";
import { selectIngredientHistoryRows } from "./PersonalizedScanCard.helpers";
import { DietEvaluationRows, IngredientHistoryRows } from "./PersonalizedScanCard";
import { ScoreDriversList } from "./ScoreDrivers";
import { InfoPill } from "../common/UI";
import { palette, spacing, tokens, type } from "../../theme";

export function MenuRankingCard({
	items,
	expandedId,
	onToggle,
	onConsume,
}: {
	items: MenuTierItem[];
	expandedId: string | null;
	onToggle: (id: string) => void;
	onConsume?: (item: MenuTierItem) => void;
}) {
	if (items.length === 0) {
		return null;
	}

	return (
		<View style={styles.resultCard}>
			<View style={styles.rankingHeader}>
				<View>
					<Text style={styles.cardTitle}>Full menu ranking</Text>
					<Text style={styles.rankingSubtitle}>
						{items.length} item{items.length === 1 ? "" : "s"} scored from lowest to highest risk
					</Text>
				</View>
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
	const color = colorForLevel(level);
	return (
		<View style={styles.resultCard}>
			<View style={styles.tierHeader}>
				<Ionicons name="checkmark-circle" size={26} color={color} />
				<Text style={styles.tierTitle}>{title}</Text>
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
	onConsume?: (item: MenuTierItem) => void;
}) {
	const riskColor = colorForLevel(item.level);
	const scoreDrivers = prioritizeScoreContributors(item.scoreContributors, 4);
	const ingredientHistoryRows = selectIngredientHistoryRows(item.ingredientRisks, 3);
	const hasExpandedContent =
		Boolean(item.insight) ||
		scoreDrivers.length > 0 ||
		Boolean(item.triggers?.length) ||
		Boolean(item.dietEvaluations?.length) ||
		ingredientHistoryRows.length > 0 ||
		Boolean(item.saferSwap);
	return (
		<Pressable
			onPress={hasExpandedContent ? onToggle : undefined}
			style={({ pressed }) => [styles.menuRow, pressed && hasExpandedContent && styles.menuRowPressed]}
		>
			<View style={styles.menuRowTop}>
				{typeof item.rank === "number" ? (
					<View style={[styles.rankBadge, { backgroundColor: riskColor }]}>
						<Text style={styles.rankText}>{item.rank}</Text>
					</View>
				) : null}
				<View style={styles.menuRowBody}>
					{item.section || item.price ? (
						<Text style={styles.menuMeta}>
							{[item.section, item.price].filter(Boolean).join(" • ")}
						</Text>
					) : null}
					<Text style={styles.menuName}>{item.name}</Text>
					<Text style={styles.menuReason}>{item.reason}</Text>
				</View>
				<View style={[styles.scorePill, { borderColor: riskColor }]}>
					<Text style={[styles.scorePillText, { color: riskColor }]}>{item.score}</Text>
				</View>
				{hasExpandedContent ? (
					<Ionicons
						name={expanded ? "chevron-up" : "chevron-down"}
						size={18}
						color={palette.textMuted}
					/>
				) : null}
			</View>
			{expanded && hasExpandedContent ? (
				<View style={styles.expandedBlock}>
					{item.insight ? (
						<>
							<Text style={styles.insightLabel}>Why this score</Text>
							<Text style={styles.insightBody}>{item.insight}</Text>
						</>
					) : null}
					{item.triggers && item.triggers.length > 0 ? (
						<View style={styles.triggerChipsRow}>
							{item.triggers.map((trigger) => (
								<InfoPill key={trigger} label={trigger} tone="warm" />
							))}
						</View>
					) : null}
					{scoreDrivers.length > 0 ? (
						<ScoreDriversList contributors={scoreDrivers} accentColor={riskColor} />
					) : null}
					{item.dietEvaluations && item.dietEvaluations.length > 0 ? (
						<View style={styles.scoreDrivers}>
							<Text style={styles.insightLabel}>Diet fit</Text>
							<DietEvaluationRows evaluations={item.dietEvaluations} />
						</View>
					) : null}
					{ingredientHistoryRows.length > 0 ? (
						<View style={styles.scoreDrivers}>
							<Text style={styles.insightLabel}>Ingredient history</Text>
							<IngredientHistoryRows rows={ingredientHistoryRows} />
						</View>
					) : null}
					{item.saferSwap ? (
						<View style={styles.saferSwapRow}>
							<Ionicons name="chatbubble-ellipses-outline" size={16} color={palette.primary} />
							<Text style={styles.saferSwapText}>{item.saferSwap}</Text>
						</View>
					) : null}
					{onConsume ? (
						<Pressable
							accessibilityRole="button"
							disabled={item.consumed}
							onPress={() => onConsume(item)}
							style={({ pressed }) => [
								styles.consumeButton,
								item.consumed && styles.consumeButtonDone,
								pressed && !item.consumed && { opacity: 0.85 },
							]}
						>
							<Ionicons
								name={item.consumed ? "checkmark-circle" : "restaurant-outline"}
								size={15}
								color={item.consumed ? tokens.color.status.risk.low.foreground : palette.primary}
							/>
							<Text
								style={[styles.consumeButtonText, item.consumed && styles.consumeButtonTextDone]}
							>
								{item.consumed ? "Logged as eaten" : "I ordered this"}
							</Text>
						</Pressable>
					) : null}
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
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
	rankingHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	rankingSubtitle: {
		marginTop: 2,
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
	menuRows: {
		gap: spacing.sm,
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
	rankBadge: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
	},
	rankText: {
		color: palette.white,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	menuRowBody: {
		flex: 1,
		minWidth: 0,
		gap: 2,
	},
	menuMeta: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
		letterSpacing: 0.3,
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
	scoreDrivers: {
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
	consumeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: palette.primary,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.sm,
		alignSelf: "flex-start",
	},
	consumeButtonDone: {
		borderColor: tokens.color.status.risk.low.tint,
		backgroundColor: tokens.color.status.risk.low.background,
	},
	consumeButtonText: {
		color: palette.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	consumeButtonTextDone: {
		color: tokens.color.status.risk.low.foreground,
	},
});

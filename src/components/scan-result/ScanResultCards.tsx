import { Ionicons } from "@expo/vector-icons";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";

import { InfoPill } from "../common/UI";
import { palette, spacing, tokens, type } from "../../theme";
import type { ScoreContributor } from "../../types/domain";

if (
	Platform.OS === "android" &&
	UIManager.setLayoutAnimationEnabledExperimental
) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type RiskLevel = "low" | "medium" | "high";

export type ScanIngredient = {
	name: string;
	level: RiskLevel;
	note?: string;
};

export type MenuTierItem = {
	id: string;
	rank?: number;
	name: string;
	section?: string;
	price?: string;
	score: number;
	level: RiskLevel;
	reason: string;
	insight?: string;
	triggers?: string[];
	scoreContributors?: ScoreContributor[];
	scoringConfidence?: "low" | "medium" | "high";
	saferSwap?: string;
};

export function colorForLevel(level: RiskLevel) {
	if (level === "high") return tokens.color.status.risk.high.tint;
	if (level === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

export function RiskHeroCard({
	eyebrow,
	title,
	score,
	level,
}: {
	eyebrow: string;
	title?: string;
	score: number;
	level: RiskLevel;
}) {
	const color = colorForLevel(level);
	const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
	const clampedScore = Math.max(0, Math.min(100, score));
	return (
		<View style={styles.riskHeroCard}>
			<Text style={styles.kicker}>{eyebrow}</Text>
			{title ? <Text style={styles.riskTitle}>{title}</Text> : null}
			<View style={styles.heroScoreRow}>
				<Text style={[styles.heroScore, { color }]}>{score}</Text>
				<View style={styles.heroScoreTrailing}>
					<Text style={styles.heroScale}>/ 100</Text>
					<Text style={[styles.heroLevelWord, { color }]}>{levelLabel} risk</Text>
				</View>
			</View>
			<View style={styles.meterTrack}>
				<View
					style={[
						styles.meterFill,
						{ width: `${clampedScore}%`, backgroundColor: color },
					]}
				/>
				<View
					style={[styles.meterMarker, { left: `${clampedScore}%`, borderColor: color }]}
				/>
			</View>
			<View style={styles.meterScale}>
				<Text style={styles.meterScaleLabel}>Low</Text>
				<Text style={styles.meterScaleLabel}>Medium</Text>
				<Text style={styles.meterScaleLabel}>High</Text>
			</View>
		</View>
	);
}

export function IngredientsBreakdownCard({
	title = "Ingredient breakdown",
	ingredients,
}: {
	title?: string;
	ingredients: ScanIngredient[];
}) {
	const groups: { level: RiskLevel; label: string; items: ScanIngredient[] }[] = [
		{ level: "high", label: "Higher risk", items: ingredients.filter((i) => i.level === "high") },
		{ level: "medium", label: "Watch for", items: ingredients.filter((i) => i.level === "medium") },
		{ level: "low", label: "Easier on your gut", items: ingredients.filter((i) => i.level === "low") },
	];
	const visibleGroups = groups.filter((group) => group.items.length > 0);

	if (visibleGroups.length === 0) {
		return null;
	}

	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>{title}</Text>
			<View style={styles.ingredientGroups}>
				{visibleGroups.map((group) => (
					<IngredientGroup
						key={group.level}
						label={group.label}
						level={group.level}
						items={group.items}
					/>
				))}
			</View>
		</View>
	);
}

function IngredientGroup({
	label,
	level,
	items,
}: {
	label: string;
	level: RiskLevel;
	items: ScanIngredient[];
}) {
	const color = colorForLevel(level);
	return (
		<View style={styles.ingredientGroup}>
			<View style={styles.ingredientGroupHeader}>
				<View style={[styles.ingredientGroupDot, { backgroundColor: color }]} />
				<Text style={[styles.ingredientGroupLabel, { color }]}>{label}</Text>
				<Text style={styles.ingredientGroupCount}>
					{items.length} item{items.length === 1 ? "" : "s"}
				</Text>
			</View>
			<View style={styles.ingredientCards}>
				{items.map((item) => (
					<IngredientCard key={item.name} ingredient={item} />
				))}
			</View>
		</View>
	);
}

function IngredientCard({ ingredient }: { ingredient: ScanIngredient }) {
	const color = colorForLevel(ingredient.level);
	return (
		<View style={styles.ingredientCard}>
			<View style={[styles.ingredientCardStripe, { backgroundColor: color }]} />
			<View style={styles.ingredientCardBody}>
				<Text style={styles.ingredientCardName}>{ingredient.name}</Text>
				{ingredient.note ? (
					<Text style={styles.ingredientCardNote}>{ingredient.note}</Text>
				) : null}
			</View>
		</View>
	);
}

export function MenuRankingCard({
	items,
	expandedId,
	onToggle,
}: {
	items: MenuTierItem[];
	expandedId: string | null;
	onToggle: (id: string) => void;
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
}: {
	item: MenuTierItem;
	expanded: boolean;
	onToggle: () => void;
}) {
	const riskColor = colorForLevel(item.level);
	const scoreDrivers = (item.scoreContributors ?? [])
		.filter((driver) => driver.key !== "base_menu_risk" && driver.key !== "profile_context")
		.slice(0, 4);
	const hasExpandedContent =
		Boolean(item.insight) || scoreDrivers.length > 0 || Boolean(item.triggers?.length) || Boolean(item.saferSwap);
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
						<View style={styles.scoreDrivers}>
							<Text style={styles.insightLabel}>Score drivers</Text>
							{scoreDrivers.map((driver) => {
								const driverColor = driver.points >= 0 ? riskColor : palette.primary;
								const pointsLabel = `${driver.points > 0 ? "+" : ""}${driver.points}`;
								return (
									<View key={`${driver.key}-${driver.source}`} style={styles.scoreDriverRow}>
										<Text style={[styles.scoreDriverPoints, { color: driverColor }]}>{pointsLabel}</Text>
										<View style={styles.scoreDriverBody}>
											<Text style={styles.scoreDriverLabel}>{driver.label}</Text>
											<Text style={styles.scoreDriverReason}>{driver.reason}</Text>
										</View>
									</View>
								);
							})}
						</View>
					) : null}
					{item.saferSwap ? (
						<View style={styles.saferSwapRow}>
							<Ionicons name="chatbubble-ellipses-outline" size={16} color={palette.primary} />
							<Text style={styles.saferSwapText}>{item.saferSwap}</Text>
						</View>
					) : null}
				</View>
			) : null}
		</Pressable>
	);
}

export function toggleExpandedId(
	current: string | null,
	id: string,
	setter: (next: string | null) => void
) {
	LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
	setter(current === id ? null : id);
}

const styles = StyleSheet.create({
	riskHeroCard: {
		width: "100%",
		borderRadius: 28,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.xs,
		...tokens.shadow.card,
	},
	kicker: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	riskTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 28,
	},
	heroScoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	heroScore: {
		fontFamily: type.body.bold,
		fontSize: 56,
		lineHeight: 60,
		letterSpacing: -1.5,
	},
	heroScoreTrailing: {
		flex: 1,
		gap: 2,
	},
	heroScale: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 18,
	},
	heroLevelWord: {
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 22,
	},
	meterTrack: {
		marginTop: spacing.sm,
		height: 10,
		borderRadius: 999,
		backgroundColor: tokens.color.chart.track,
		overflow: "visible",
		position: "relative",
	},
	meterFill: {
		height: "100%",
		borderRadius: 999,
	},
	meterMarker: {
		position: "absolute",
		top: -3,
		width: 16,
		height: 16,
		borderRadius: 8,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 3,
		marginLeft: -8,
		...tokens.shadow.card,
	},
	meterScale: {
		marginTop: spacing.xs,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	meterScaleLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
		letterSpacing: 0.4,
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
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
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
	rankingHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
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
	scoreDriverRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 14,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	scoreDriverPoints: {
		minWidth: 34,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
	},
	scoreDriverBody: {
		flex: 1,
		gap: 1,
	},
	scoreDriverLabel: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	scoreDriverReason: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
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
	ingredientGroups: {
		gap: spacing.md,
	},
	ingredientGroup: {
		gap: spacing.xs,
	},
	ingredientGroupHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	ingredientGroupDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	ingredientGroupLabel: {
		flex: 1,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	ingredientGroupCount: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	ingredientCards: {
		gap: spacing.xs,
	},
	ingredientCard: {
		flexDirection: "row",
		borderRadius: 14,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		minHeight: 50,
	},
	ingredientCardStripe: {
		width: 4,
	},
	ingredientCardBody: {
		flex: 1,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		gap: 2,
		justifyContent: "center",
	},
	ingredientCardName: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 20,
	},
	ingredientCardNote: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
});

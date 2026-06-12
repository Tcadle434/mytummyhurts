import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import Svg, { Circle } from "react-native-svg";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";

import { InfoPill } from "../common/UI";
import { palette, spacing, tokens, type } from "../../theme";
import type { DietEvaluation, DietFitStatus, ScoreContributor } from "../../types/domain";

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
	dietEvaluations?: DietEvaluation[];
	saferSwap?: string;
	sourceItemId?: string;
	consumed?: boolean;
};

export function colorForLevel(level: RiskLevel) {
	if (level === "high") return tokens.color.status.risk.high.tint;
	if (level === "medium") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

const PERSONAL_EVIDENCE = new Set<ScoreContributor["evidence"]>(["profile", "learning"]);

export function isPersonalContributor(contributor: ScoreContributor) {
	return PERSONAL_EVIDENCE.has(contributor.evidence);
}

// Personalization receipts: contributors derived from the user's own profile or
// learned history are pinned ahead of generic rubric drivers so every result
// visibly reflects what the user told us.
export function prioritizeScoreContributors(
	contributors: ScoreContributor[] | undefined,
	limit = 4,
) {
	return [...(contributors ?? [])]
		.filter((contributor) => contributor.key !== "base_menu_risk")
		.sort((left, right) => {
			const leftPersonal = isPersonalContributor(left) ? 1 : 0;
			const rightPersonal = isPersonalContributor(right) ? 1 : 0;
			return rightPersonal - leftPersonal || Math.abs(right.points) - Math.abs(left.points);
		})
		.slice(0, limit);
}

export function ScoreDriversList({
	contributors,
	accentColor,
	title = "Score drivers",
	compact = false,
}: {
	contributors: ScoreContributor[];
	accentColor: string;
	title?: string | null;
	compact?: boolean;
}) {
	if (!contributors.length) {
		return null;
	}

	if (compact) {
		// Weight hierarchy via the app's existing meter idiom: a thin tinted
		// track under each driver, filled by its share of the largest one.
		// Thin bars make 100% vs 70% legible; background floods don't.
		const maxMagnitude = Math.max(...contributors.map((driver) => Math.abs(driver.points)), 1);
		return (
			<View style={styles.driverList}>
				{title ? <Text style={styles.insightLabel}>{title}</Text> : null}
				{contributors.map((driver) => {
					const magnitude = Math.abs(driver.points);
					const tone =
						driver.points < 0
							? tokens.color.status.risk.low
							: magnitude >= 15
								? tokens.color.status.risk.high
								: magnitude >= 8
									? tokens.color.status.risk.medium
									: tokens.color.status.risk.low;
					const fillPercent = Math.max(6, Math.round((magnitude / maxMagnitude) * 100));
					const pointsLabel = `${driver.points > 0 ? "+" : ""}${driver.points}`;
					return (
						<View key={`${driver.key}-${driver.source}`} style={styles.driverRow}>
							<View style={styles.scoreDriverLabelRow}>
								<View style={[styles.driverPointsCircle, { borderColor: tone.tint }]}>
									<Text style={[styles.driverPoints, { color: tone.tint }]}>{pointsLabel}</Text>
								</View>
								<Text style={styles.scoreDriverLabel} numberOfLines={1}>
									{driver.label}
								</Text>
								{isPersonalContributor(driver) ? (
									<View style={styles.profileChip}>
										<Ionicons name="person" size={9} color={palette.primary} />
										<Text style={styles.profileChipText}>
											{driver.evidence === "learning" ? "Learned" : "Your profile"}
										</Text>
									</View>
								) : null}
							</View>
							{driver.source ? (
								<Text style={styles.driverSource} numberOfLines={1}>
									{driver.source}
								</Text>
							) : null}
							<View style={styles.driverTrack}>
								<View
									style={[
										styles.driverTrackFill,
										{ width: `${fillPercent}%`, backgroundColor: tone.tint },
									]}
								/>
							</View>
						</View>
					);
				})}
			</View>
		);
	}

	return (
		<View style={styles.scoreDrivers}>
			{title ? <Text style={styles.insightLabel}>{title}</Text> : null}
			{contributors.map((driver) => {
				const driverColor = driver.points >= 0 ? accentColor : palette.primary;
				const pointsLabel = `${driver.points > 0 ? "+" : ""}${driver.points}`;
				return (
					<View key={`${driver.key}-${driver.source}`} style={styles.scoreDriverRow}>
						<Text style={[styles.scoreDriverPoints, { color: driverColor }]}>{pointsLabel}</Text>
						<View style={styles.scoreDriverBody}>
							<View style={styles.scoreDriverLabelRow}>
								<Text style={styles.scoreDriverLabel}>{driver.label}</Text>
								{isPersonalContributor(driver) ? (
									<View style={styles.profileChip}>
										<Ionicons name="person" size={9} color={palette.primary} />
										<Text style={styles.profileChipText}>
											{driver.evidence === "learning" ? "Learned" : "Your profile"}
										</Text>
									</View>
								) : null}
							</View>
							<Text style={styles.scoreDriverReason}>{driver.reason}</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

export function WhyThisScoreCard({
	contributors,
	level,
	impactSummary,
}: {
	contributors?: ScoreContributor[];
	level: RiskLevel;
	impactSummary?: string;
}) {
	const prioritized = prioritizeScoreContributors(contributors, 4);
	if (!prioritized.length) {
		return null;
	}

	const personalLabels = prioritized
		.filter(isPersonalContributor)
		.map((contributor) => contributor.label.toLowerCase());
	const accentColor = colorForLevel(level);

	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>Why this score for you</Text>
			{personalLabels.length > 0 ? (
				<View style={styles.receiptRow}>
					<Ionicons name="sparkles" size={14} color={palette.primary} />
					<Text style={styles.receiptText}>
						Because you told us: {personalLabels.join(", ")}
					</Text>
				</View>
			) : null}
			<ScoreDriversList contributors={prioritized} accentColor={accentColor} title={null} compact />
			{impactSummary ? <Text style={styles.scoreDriverReason}>{impactSummary}</Text> : null}
		</View>
	);
}

function ScoreArc({ score, level }: { score: number; level: RiskLevel }) {
	const size = 104;
	const strokeWidth = 9;
	const radius = (size - strokeWidth) / 2;
	const center = size / 2;
	const circumference = 2 * Math.PI * radius;
	const clamped = Math.max(0, Math.min(100, score));
	const dashOffset = circumference - (circumference * clamped) / 100;
	const tone = colorForLevel(level);

	return (
		<View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
			<Svg width={size} height={size}>
				<Circle cx={center} cy={center} r={radius} stroke={tokens.color.chart.track} strokeWidth={strokeWidth} fill="transparent" />
				<Circle
					cx={center}
					cy={center}
					r={radius}
					stroke={tone}
					strokeWidth={strokeWidth}
					strokeDasharray={`${circumference} ${circumference}`}
					strokeDashoffset={dashOffset}
					strokeLinecap="round"
					fill="transparent"
					rotation={-90}
					origin={`${center}, ${center}`}
				/>
			</Svg>
			<View style={styles.scoreArcCenter}>
				<Text style={[styles.scoreArcValue, { color: tone }]}>{score}</Text>
				<Text style={styles.scoreArcScale}>/100</Text>
			</View>
		</View>
	);
}

export type HeroConditionChip = { name: string; level: RiskLevel };

// Consolidated result hero shared by food, grocery, and menu results: photo +
// identity up top, decision block below. Menu results omit the arc and lead
// with a ranking verdict instead.
export function ScanHeroCard({
	title,
	meta,
	image,
	score,
	level,
	verdict,
	conditionChips,
}: {
	title: string;
	meta?: string;
	image?: ReactNode;
	score?: number;
	level?: RiskLevel;
	verdict?: string;
	conditionChips?: HeroConditionChip[];
}) {
	const showArc = typeof score === "number" && Boolean(level);
	const levelLabel = level ? `${level.charAt(0).toUpperCase()}${level.slice(1)} risk` : null;

	return (
		<View style={styles.resultCard}>
			<View style={styles.heroIdentityRow}>
				{image ? <View style={styles.heroImageSlot}>{image}</View> : null}
				<View style={styles.heroIdentityCopy}>
					<Text style={styles.heroCardTitle} numberOfLines={3}>
						{title}
					</Text>
					{meta ? <Text style={styles.heroCardMeta}>{meta}</Text> : null}
				</View>
			</View>

			{showArc || verdict ? <View style={styles.heroDivider} /> : null}

			{showArc ? (
				<View style={styles.heroScoreBlock}>
					<ScoreArc score={score!} level={level!} />
					<View style={styles.heroVerdictCopy}>
						<View style={styles.heroLevelRow}>
							<View style={[styles.heroLevelDot, { backgroundColor: colorForLevel(level!) }]} />
							<Text style={[styles.heroLevelText, { color: colorForLevel(level!) }]}>{levelLabel}</Text>
						</View>
						{verdict ? <Text style={styles.heroVerdict}>{verdict}</Text> : null}
					</View>
				</View>
			) : verdict ? (
				<Text style={styles.heroVerdict}>{verdict}</Text>
			) : null}

			{conditionChips && conditionChips.length > 0 ? (
				<View style={styles.heroChipRow}>
					{conditionChips.map((chip) => {
						const tone =
							chip.level === "high"
								? tokens.color.status.risk.high
								: chip.level === "medium"
									? tokens.color.status.risk.medium
									: tokens.color.status.risk.low;
						return (
							<View key={chip.name} style={[styles.heroConditionChip, { backgroundColor: tone.background }]}>
								<Text style={[styles.heroConditionChipName, { color: tone.foreground }]} numberOfLines={1}>
									{chip.name}
								</Text>
								<Text style={[styles.heroConditionChipLevel, { color: tone.foreground }]}>
									{chip.level.charAt(0).toUpperCase() + chip.level.slice(1)}
								</Text>
							</View>
						);
					})}
				</View>
			) : null}
		</View>
	);
}

export function RiskHeroCard({
	eyebrow,
	title,
	score,
	level,
	levelLabelOverride,
	cautionNote,
}: {
	eyebrow: string;
	title?: string;
	score: number;
	level: RiskLevel;
	levelLabelOverride?: string;
	cautionNote?: string;
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
					<Text style={[styles.heroLevelWord, { color }]}>
						{levelLabelOverride ?? `${levelLabel} risk`}
					</Text>
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
			{cautionNote ? <Text style={styles.cautionNote}>{cautionNote}</Text> : null}
		</View>
	);
}

export function IngredientsBreakdownCard({
	title = "Ingredient breakdown",
	ingredients,
}: {
	title?: string;
	ingredients?: ScanIngredient[];
}) {
	// Display-only noise filter: zero-signal additives add scroll, not insight.
	const NOISE_INGREDIENTS = new Set([
		"salt", "water", "vitamin e", "vitamin c", "vitamin d", "citric acid", "niacinamide",
		"sea salt", "natural vitamin e", "mixed tocopherols",
	]);
	const safeIngredients = (ingredients ?? []).filter(
		(item) => !NOISE_INGREDIENTS.has(item.name.trim().toLowerCase()),
	);
	const groups: { level: RiskLevel; label: string; items: ScanIngredient[] }[] = [
		{ level: "high", label: "Higher risk", items: safeIngredients.filter((i) => i.level === "high") },
		{ level: "medium", label: "Watch for", items: safeIngredients.filter((i) => i.level === "medium") },
		{ level: "low", label: "Easier on your gut", items: safeIngredients.filter((i) => i.level === "low") },
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

export function DietFitCard({ evaluations }: { evaluations?: DietEvaluation[] }) {
	const safeEvaluations = evaluations ?? [];
	if (!safeEvaluations.length) {
		return null;
	}

	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>Diet fit</Text>
			<View style={styles.dietRows}>
				{safeEvaluations.map((evaluation) => {
					const color = colorForDietStatus(evaluation.status);
					return (
						<View key={evaluation.dietKey} style={styles.dietRow}>
							<View style={[styles.dietStatusDot, { backgroundColor: color }]} />
							<View style={styles.dietRowBody}>
								<Text style={styles.dietTitle}>
									{dietStatusLabel(evaluation.status)} {evaluation.dietLabel}
								</Text>
								<Text style={styles.dietReason}>{evaluation.reason}</Text>
							</View>
						</View>
					);
				})}
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
			<View style={styles.ingredientChipWrap}>
				{items.map((item) => (
					<IngredientChip key={item.name} ingredient={item} />
				))}
			</View>
		</View>
	);
}

function IngredientChip({ ingredient }: { ingredient: ScanIngredient }) {
	const color = colorForLevel(ingredient.level);
	return (
		<View style={styles.ingredientChip}>
			<View style={[styles.ingredientChipDot, { backgroundColor: color }]} />
			<Text style={styles.ingredientChipName} numberOfLines={1}>
				{ingredient.name}
			</Text>
		</View>
	);
}


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
	const hasExpandedContent =
		Boolean(item.insight) ||
		scoreDrivers.length > 0 ||
		Boolean(item.triggers?.length) ||
		Boolean(item.dietEvaluations?.length) ||
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
							{item.dietEvaluations.map((evaluation) => (
								<View key={evaluation.dietKey} style={styles.dietChipRow}>
									<View
										style={[
											styles.dietStatusDot,
											{ backgroundColor: colorForDietStatus(evaluation.status) },
										]}
									/>
									<View style={styles.scoreDriverBody}>
										<Text style={styles.scoreDriverLabel}>
											{dietStatusLabel(evaluation.status)} {evaluation.dietLabel}
										</Text>
										<Text style={styles.scoreDriverReason}>{evaluation.reason}</Text>
									</View>
								</View>
							))}
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

function colorForDietStatus(status: DietFitStatus) {
	if (status === "does_not_fit") return tokens.color.status.risk.high.tint;
	if (status === "caution" || status === "unknown") return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.low.tint;
}

function dietStatusLabel(status: DietFitStatus) {
	if (status === "does_not_fit") return "Doesn't fit";
	if (status === "caution") return "Use caution for";
	if (status === "unknown") return "Cannot verify";
	return "Fits";
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
	cautionNote: {
		color: tokens.color.status.risk.medium.foreground,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 17,
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
	heroIdentityRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	heroImageSlot: {
		width: 64,
		height: 64,
		borderRadius: 18,
		overflow: "hidden",
	},
	heroIdentityCopy: {
		flex: 1,
		gap: 3,
	},
	heroCardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.3,
	},
	heroCardMeta: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	heroDivider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
	},
	heroScoreBlock: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	heroVerdictCopy: {
		flex: 1,
		gap: 4,
	},
	heroLevelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	heroLevelDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	heroLevelText: {
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	heroVerdict: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 16,
		lineHeight: 22,
	},
	heroChipRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	heroConditionChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
		maxWidth: "100%",
	},
	heroConditionChipName: {
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		flexShrink: 1,
	},
	heroConditionChipLevel: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	scoreArcCenter: {
		position: "absolute",
		alignItems: "center",
	},
	scoreArcValue: {
		fontFamily: type.body.bold,
		fontSize: 27,
		lineHeight: 31,
	},
	scoreArcScale: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 10,
		lineHeight: 13,
	},
	driverList: {
		gap: spacing.md,
	},
	driverRow: {
		gap: 5,
	},
	driverPointsCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	driverPoints: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	driverSource: {
		marginLeft: 44,
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
	driverTrack: {
		marginLeft: 44,
		height: 4,
		borderRadius: 2,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	driverTrackFill: {
		height: "100%",
		borderRadius: 2,
	},
	scoreDriverLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		flexWrap: "wrap",
	},
	scoreDriverLabel: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	profileChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: spacing.xs,
		paddingVertical: 1,
		borderRadius: 999,
		backgroundColor: palette.sageSoft,
	},
	profileChipText: {
		color: palette.primary,
		fontFamily: type.body.semibold,
		fontSize: 10,
		lineHeight: 14,
	},
	receiptRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: 12,
		backgroundColor: palette.sageSoft,
	},
	receiptText: {
		flex: 1,
		color: palette.primaryDark,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 17,
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
	dietRows: {
		gap: spacing.sm,
	},
	dietRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	dietChipRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 14,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	dietStatusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		marginTop: 5,
	},
	dietRowBody: {
		flex: 1,
		gap: 2,
	},
	dietTitle: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
	},
	dietReason: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 13,
		lineHeight: 18,
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
	ingredientChipWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	ingredientChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.app.default,
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
		maxWidth: "100%",
	},
	ingredientChipDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
	},
	ingredientChipName: {
		color: palette.text,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "capitalize",
		flexShrink: 1,
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
});

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type MenuTierItem, type RiskLevel } from "./common";
import {
	ConsumeMenuItemButton,
	MenuItemDetails,
	type MenuItemConsumeHandler,
} from "./MenuItemDetails";
import { resultCardStyle } from "./styles";
import { VerdictPill, type VerdictToneKey } from "../common/UI";
import { palette, spacing, tokens, type } from "../../theme";

export type { MenuItemConsumeHandler } from "./MenuItemDetails";

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

// The answer to "what do I order?" — the menu screen's one warm hero.
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
					color={tokens.color.text.accent}
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

const styles = StyleSheet.create({
	pressedDim: {
		opacity: 0.88,
	},
	// --- top-pick spotlight (the menu screen's warm hero) ---
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
	// Deep green is the accent that anchors the warm hero.
	topPickEyebrow: {
		...tokens.type.label.eyebrow,
		fontFamily: type.body.semibold,
		textTransform: "uppercase",
		color: tokens.color.text.accent,
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
		color: tokens.color.text.accent,
	},
	// Cream receipt inset: keeps a visible boundary now that the top-pick
	// card is the same white as regular cards.
	topPickDetailsInset: {
		borderRadius: tokens.radius.lg,
		backgroundColor: tokens.color.surface.app.default,
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
});

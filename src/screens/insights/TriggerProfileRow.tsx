import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EvidenceMeter, VerdictPill, verdictTone } from "../../components/common/UI";
import {
	evidenceDetailForInsight,
	type TriggerStatus,
} from "../../features/insights/triggerProfile";
import { radii, spacing, tokens, type } from "../../theme";
import { IngredientInsight, InsightConfidenceLevel } from "../../types/domain";
import { STATUS_LABEL } from "./statusVisuals";

function confidenceSegments(level: InsightConfidenceLevel) {
	return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

// A caseboard row reads like an open case file: the food, its verdict, and the
// evidence sentence — the product's best artifact — at reading size, never
// truncated mid-payoff.
export function TriggerProfileRow({
	insight,
	status,
	onPress,
	emoji,
	extraDetail,
}: {
	insight: IngredientInsight;
	status: TriggerStatus;
	onPress: () => void;
	emoji?: string;
	extraDetail?: string;
}) {
	const tone = verdictTone(status);
	const evidenceLine = evidenceDetailForInsight(insight, status);
	const detail = extraDetail ? `${evidenceLine} · ${extraDetail}` : evidenceLine;
	const conditionLabel = extraDetail ? "" : insight.linkedConditions.slice(0, 2).join(", ");
	const filledSegments = confidenceSegments(insight.confidenceLevel);
	const displayName = insight.ingredientName.charAt(0).toUpperCase() + insight.ingredientName.slice(1);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${displayName}, ${STATUS_LABEL[status]}, ${insight.confidenceLevel} confidence. ${detail}`}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
		>
			<View style={[styles.glyph, { backgroundColor: tone.background }]}>
				{emoji ? (
					<Text style={styles.glyphEmoji}>{emoji}</Text>
				) : (
					<Text style={[styles.glyphLabel, { color: tone.foreground }]}>
						{displayName.charAt(0)}
					</Text>
				)}
			</View>
			<View style={styles.copy}>
				<View style={styles.titleRow}>
					<Text style={styles.title} numberOfLines={1}>
						{displayName}
					</Text>
					{insight.sourceBreakdown.declared ? (
						<View style={styles.declaredBadge}>
							<Ionicons name="person" size={10} color={tokens.color.action.quiet.foreground} />
							<Text style={styles.declaredBadgeText}>You told us</Text>
						</View>
					) : null}
				</View>
				<Text style={styles.meta} numberOfLines={2}>
					{detail}
					{conditionLabel ? ` · ${conditionLabel}` : ""}
				</Text>
				<View style={styles.footRow}>
					<VerdictPill label={STATUS_LABEL[status]} tone={status} size="sm" />
					<View style={styles.meterWrap}>
						<EvidenceMeter
							filled={filledSegments}
							total={3}
							label={`${capitalize(insight.confidenceLevel)} confidence`}
							tone={status}
						/>
					</View>
				</View>
			</View>
			<Ionicons
				name="chevron-forward"
				size={18}
				color={tokens.color.icon.muted}
				style={styles.chevron}
			/>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		...tokens.shadow.card,
	},
	glyph: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	glyphLabel: {
		fontFamily: type.body.bold,
		fontSize: 17,
	},
	glyphEmoji: {
		fontSize: 20,
	},
	copy: {
		flex: 1,
		gap: spacing.xs,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	title: {
		...tokens.type.body.strong,
		flexShrink: 1,
		color: tokens.color.text.primary,
	},
	declaredBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.action.quiet.background,
		paddingHorizontal: spacing.xs,
		paddingVertical: 2,
	},
	declaredBadgeText: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
		color: tokens.color.action.quiet.foreground,
	},
	meta: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
	},
	footRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 2,
	},
	meterWrap: {
		flex: 1,
	},
	chevron: {
		alignSelf: "center",
	},
});

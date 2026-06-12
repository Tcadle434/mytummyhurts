import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
	evidenceDetailForInsight,
	type TriggerStatus,
} from "../../features/insights/triggerProfile";
import { palette, radii, spacing, tokens, type } from "../../theme";
import { IngredientInsight, InsightConfidenceLevel } from "../../types/domain";

export const STATUS_META: Record<
	TriggerStatus,
	{ pill: string; tone: { background: string; foreground: string; tint: string } }
> = {
	confirmed: { pill: "Confirmed", tone: tokens.color.status.risk.high },
	suspect: { pill: "Reviewing", tone: tokens.color.status.risk.medium },
	cleared: { pill: "Cleared", tone: tokens.color.status.risk.low },
	safe: { pill: "Safe", tone: tokens.color.status.risk.low },
};

function confidenceSegments(level: InsightConfidenceLevel) {
	return level === "high" ? 3 : level === "medium" ? 2 : 1;
}

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
	const meta = STATUS_META[status];
	const evidenceLine = evidenceDetailForInsight(insight, status);
	const detail = extraDetail ? `${evidenceLine} · ${extraDetail}` : evidenceLine;
	const conditionLabel = extraDetail ? "" : insight.linkedConditions.slice(0, 2).join(", ");
	const filledSegments = confidenceSegments(insight.confidenceLevel);
	const displayName = insight.ingredientName.charAt(0).toUpperCase() + insight.ingredientName.slice(1);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${displayName}, ${meta.pill}, ${insight.confidenceLevel} confidence. ${detail}`}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
		>
			<View style={[styles.glyph, { backgroundColor: meta.tone.background }]}>
				{emoji ? (
					<Text style={styles.glyphEmoji}>{emoji}</Text>
				) : (
					<Text style={[styles.glyphLabel, { color: meta.tone.tint }]}>
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
							<Ionicons name="person" size={9} color={palette.primary} />
							<Text style={styles.declaredBadgeText}>You told us</Text>
						</View>
					) : null}
				</View>
				<Text style={styles.meta} numberOfLines={1}>
					{detail}
					{conditionLabel ? ` · ${conditionLabel}` : ""}
				</Text>
			</View>
			<View style={styles.confidenceTrack} accessibilityElementsHidden>
				{[0, 1, 2].map((segment) => (
					<View
						key={segment}
						style={[
							styles.confidenceSegment,
							segment < filledSegments && { backgroundColor: meta.tone.tint },
						]}
					/>
				))}
			</View>
			<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
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
		gap: 3,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	title: {
		flexShrink: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 19,
	},
	declaredBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		borderRadius: 999,
		backgroundColor: palette.sageSoft,
		paddingHorizontal: spacing.xs,
		paddingVertical: 1,
	},
	declaredBadgeText: {
		color: palette.primary,
		fontFamily: type.body.semibold,
		fontSize: 9,
		lineHeight: 13,
	},
	meta: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	confidenceTrack: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	confidenceSegment: {
		width: 12,
		height: 4,
		borderRadius: 2,
		backgroundColor: tokens.color.chart.track,
	},
});

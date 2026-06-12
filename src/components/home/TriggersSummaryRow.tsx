import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette, radii, spacing, tokens, type } from "../../theme";
import type { TriggerCounts } from "../../features/insights/triggerProfile";

// Compact entry point to the Trigger Profile: live counts, no narrative.
export function TriggersSummaryRow({
	counts,
	onPress,
}: {
	counts: TriggerCounts;
	onPress: () => void;
}) {
	const parts: string[] = [];
	if (counts.suspects > 0) {
		parts.push(`${counts.suspects} under review`);
	}
	if (counts.confirmed > 0) {
		parts.push(`${counts.confirmed} confirmed`);
	}
	if (counts.cleared > 0) {
		parts.push(`${counts.cleared} cleared`);
	}
	if (parts.length === 0 && counts.safe > 0) {
		parts.push(`${counts.safe} safe food${counts.safe === 1 ? "" : "s"}`);
	}

	if (parts.length === 0) {
		return null;
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Your triggers: ${parts.join(", ")}`}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
		>
			<View style={styles.iconBubble}>
				<Ionicons name="search" size={16} color={palette.primary} />
			</View>
			<View style={styles.copy}>
				<Text style={styles.title}>Your triggers</Text>
				<Text style={styles.detail}>{parts.join(" · ")}</Text>
			</View>
			<Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		...tokens.shadow.card,
	},
	iconBubble: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: palette.sageSoft,
	},
	copy: {
		flex: 1,
		gap: 1,
	},
	title: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 18,
	},
	detail: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
});

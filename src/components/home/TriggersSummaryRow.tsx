import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { verdictTone } from "../common/UI";
import { palette, radii, spacing, tokens, type } from "../../theme";
import type { TriggerCounts } from "../../features/insights/triggerProfile";

// Compact entry point to the Trigger Profile: a one-glance pulse. Confirmed
// triggers carry status weight; with nothing tracked yet it teases the first
// foods instead of vanishing.
export function TriggersSummaryRow({
	counts,
	onPress,
}: {
	counts: TriggerCounts;
	onPress: () => void;
}) {
	const confirmedTone = verdictTone("confirmed");
	const confirmedPart = counts.confirmed > 0 ? `${counts.confirmed} confirmed` : "";

	const restParts: string[] = [];
	if (counts.suspects > 0) {
		restParts.push(`${counts.suspects} under review`);
	}
	if (counts.safe > 0) {
		restParts.push(`${counts.safe} looking safe`);
	}
	if (counts.cleared > 0) {
		restParts.push(`${counts.cleared} cleared`);
	}
	if (!confirmedPart && restParts.length === 0 && counts.watching > 0) {
		restParts.push(`watching ${counts.watching} food${counts.watching === 1 ? "" : "s"}`);
	}

	const isTeaser = !confirmedPart && restParts.length === 0;
	const teaserDetail = "Pip is watching your first foods";
	const detailText = isTeaser
		? teaserDetail
		: [confirmedPart, ...restParts].filter(Boolean).join(" · ");

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`Your triggers: ${detailText}`}
			onPress={onPress}
			style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
		>
			<View
				style={[
					styles.iconBubble,
					counts.confirmed > 0 && { backgroundColor: confirmedTone.background },
				]}
			>
				<Ionicons
					name="search"
					size={16}
					color={
						counts.confirmed > 0 ? confirmedTone.foreground : tokens.color.accent.brand
					}
				/>
			</View>
			<View style={styles.copy}>
				<Text style={styles.title}>Your triggers</Text>
				<Text style={styles.detail} numberOfLines={1}>
					{confirmedPart ? (
						<Text style={styles.detailConfirmed}>{confirmedPart}</Text>
					) : null}
					{confirmedPart && restParts.length > 0 ? " · " : ""}
					{isTeaser ? teaserDetail : restParts.join(" · ")}
				</Text>
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
		...tokens.type.label.metric,
		color: tokens.color.text.secondary,
	},
	detailConfirmed: {
		...tokens.type.label.metric,
		fontFamily: type.body.semibold,
		color: tokens.color.status.verdict.confirmed.foreground,
	},
});

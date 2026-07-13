import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TrackedFoodFamilyEntry } from "../../features/insights/triggerGroups";
import { radii, spacing, tokens, type } from "../../theme";

export function TrackedFamilies({
	entries,
	expanded,
	onToggle,
	onOpen,
}: {
	entries: TrackedFoodFamilyEntry[];
	expanded: boolean;
	onToggle: () => void;
	onOpen: (familyKey: string, label: string) => void;
}) {
	if (entries.length === 0) return null;

	return (
		<View style={styles.block}>
			<Pressable
				accessibilityRole="button"
				accessibilityState={{ expanded }}
				onPress={onToggle}
				style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.85 }]}
			>
				<Ionicons
					name={expanded ? "chevron-down" : "chevron-forward"}
					size={15}
					color={tokens.color.text.secondary}
				/>
				<Text style={styles.toggleText}>Still watching</Text>
				<Text style={styles.toggleCount}>{entries.length}</Text>
			</Pressable>
			<Text style={styles.intro}>
				Foods from your scans that need paired check-ins before a verdict.
			</Text>
			{expanded ? (
				<View style={styles.list}>
					{entries.map((entry) => (
						<Pressable
							key={entry.family.key}
							accessibilityRole="button"
							accessibilityLabel={`${entry.family.label}, ${familyMeta(entry.members.length, entry.evidenceCount)}`}
							onPress={() => onOpen(entry.family.key, entry.family.label)}
							style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
						>
							<View style={styles.glyph}>
								<Text style={styles.glyphEmoji}>{entry.family.emoji}</Text>
							</View>
							<View style={styles.copy}>
								<Text style={styles.rowName} numberOfLines={1}>
									{entry.family.label}
								</Text>
								<Text style={styles.rowMeta} numberOfLines={2}>
									{familyMeta(entry.members.length, entry.evidenceCount)}
									{entry.memberSummary ? ` · ${entry.memberSummary}` : ""}
								</Text>
							</View>
							<Ionicons name="chevron-forward" size={18} color={tokens.color.icon.muted} />
						</Pressable>
					))}
				</View>
			) : null}
		</View>
	);
}

function familyMeta(foodCount: number, evidenceCount: number) {
	const foods = `${foodCount} food${foodCount === 1 ? "" : "s"}`;
	if (evidenceCount <= 0) return foods;
	return `${foods} tracked across ${evidenceCount} paired day${evidenceCount === 1 ? "" : "s"}`;
}

const styles = StyleSheet.create({
	block: {
		gap: spacing.xs,
	},
	toggle: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.sm,
	},
	toggleText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	toggleCount: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
	},
	intro: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
		paddingHorizontal: spacing.sm,
		marginTop: -spacing.xs,
	},
	list: {
		gap: spacing.xs,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	glyph: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.status.verdict.watching.background,
	},
	glyphEmoji: {
		fontSize: 18,
	},
	copy: {
		flex: 1,
		gap: 3,
	},
	rowName: {
		flexShrink: 1,
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	rowMeta: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 11,
		lineHeight: 15,
	},
});

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, tokens, type } from "../../theme";
import { formatConditionName } from "../../utils/conditionFormat";

type ConditionsChipRowProps = {
	conditions: string[];
	onEdit: () => void;
};

// A quiet supporting utility: the user's conditions on warm-neutral surfaces —
// never the success green that means "safe food" elsewhere on this screen.
export function ConditionsChipRow({ conditions, onEdit }: ConditionsChipRowProps) {
	return (
		<View style={styles.wrap}>
			<View style={styles.headerRow}>
				<Text style={styles.label}>Your conditions</Text>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Edit conditions"
					onPress={onEdit}
					hitSlop={8}
					style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.78 }]}
				>
					<Ionicons name="create-outline" size={14} color={tokens.color.text.secondary} />
					<Text style={styles.editButtonLabel}>Edit</Text>
				</Pressable>
			</View>
			{conditions.length ? (
				<View style={styles.chipWrap}>
					{conditions.map((condition) => (
						<View key={condition} style={styles.chip}>
							<Text style={styles.chipLabel}>{formatConditionName(condition)}</Text>
						</View>
					))}
				</View>
			) : (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Add conditions"
					onPress={onEdit}
					style={({ pressed }) => [styles.emptyChip, pressed && { opacity: 0.86 }]}
				>
					<Ionicons name="add" size={14} color={tokens.color.text.tertiary} />
					<Text style={styles.emptyChipLabel}>Add conditions</Text>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		gap: spacing.sm,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	label: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.text.secondary,
	},
	editButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.utility.white,
	},
	editButtonLabel: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
		color: tokens.color.text.secondary,
	},
	chipWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	chip: {
		minHeight: 30,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.verdict.watching.background,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	chipLabel: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.status.verdict.watching.foreground,
	},
	emptyChip: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 30,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderStyle: "dashed",
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
		backgroundColor: "transparent",
	},
	emptyChipLabel: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
		color: tokens.color.text.tertiary,
	},
});

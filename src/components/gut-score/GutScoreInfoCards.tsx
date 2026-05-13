import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { spacing, tokens } from "../../theme";

type GutScoreInfoCard = {
	iconName: ComponentProps<typeof Ionicons>["name"];
	description: string;
	accessibilityLabel?: string;
};

type GutScoreInfoCardsProps = {
	style?: StyleProp<ViewStyle>;
};

const gutScoreInfoCards: GutScoreInfoCard[] = [
	{
		iconName: "arrow-up-circle-outline",
		description: "Higher is better",
	},
	{
		iconName: "clipboard-outline",
		description: "Based on your scans & reports",
	},
	{
		iconName: "leaf-outline",
		description: "Improves as you learn triggers",
	},
];

export function GutScoreInfoCards({ style }: GutScoreInfoCardsProps) {
	return (
		<View style={[styles.infoBoxRow, style]}>
			{gutScoreInfoCards.map((card) => (
				<GutScoreInfoBox key={card.description} {...card} />
			))}
		</View>
	);
}

function GutScoreInfoBox({
	iconName,
	description,
	accessibilityLabel,
}: GutScoreInfoCard) {
	return (
		<View
			style={styles.infoBox}
			accessible
			accessibilityLabel={accessibilityLabel ?? description}
		>
			<View style={styles.infoBoxIconWrap}>
				<Ionicons name={iconName} size={34} color={tokens.color.accent.brand} />
			</View>
			<Text style={styles.infoBoxDescription}>{description}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	infoBoxRow: {
		width: "100%",
		flexDirection: "row",
		gap: spacing.xs,
		marginTop: spacing.sm,
	},
	infoBox: {
		flex: 1,
		minHeight: 116,
		alignItems: "center",
		justifyContent: "flex-start",
		gap: spacing.sm,
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.md,
		borderRadius: tokens.radius.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
	},
	infoBoxIconWrap: {
		height: 38,
		alignItems: "center",
		justifyContent: "center",
	},
	infoBoxDescription: {
		...tokens.type.body.small,
		color: tokens.color.text.primary,
		textAlign: "center",
	},
});

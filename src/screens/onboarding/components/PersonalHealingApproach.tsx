import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const GENERIC_RULES = ["IBS = no dairy", "Reflux = no spice", "Cut gluten"];

const PRINCIPLES: { iconName: IoniconName; title: string; body: string }[] = [
	{
		iconName: "search-outline",
		title: "Learn",
		body: "Scans and daily reports reveal what your gut actually reacts to.",
	},
	{
		iconName: "shield-checkmark-outline",
		title: "Avoid",
		body: "Stay away from your real triggers while your stomach settles.",
	},
	{
		iconName: "leaf-outline",
		title: "Reset",
		body: "Give your gut time to calm down before you test foods again.",
	},
];

/**
 * Trust/positioning card for the onboarding flow. Frames the app's whole point
 * as a contrast: generic rules (struck through) vs. a personalized Learn /
 * Avoid / Heal loop. Replaces the older "uses / avoids" detail card.
 */
export function PersonalHealingApproach() {
	return (
		<View style={styles.card}>
			<View style={styles.genericSection}>
				<View style={styles.sectionHeader}>
					<View style={styles.headerIconMuted}>
						<Ionicons
							name="close-circle-outline"
							size={18}
							color={tokens.color.text.tertiary}
						/>
					</View>
					<Text style={styles.eyebrowMuted}>Generic advice falls short</Text>
				</View>
				<View style={styles.crossedRow}>
					{GENERIC_RULES.map((rule) => (
						<View key={rule} style={styles.crossedChip}>
							<Text style={styles.crossedChipText}>{rule}</Text>
						</View>
					))}
				</View>
				<Text style={styles.genericNote}>
					Your gut is not a category. It&apos;s yours. There&apos;s no one size fits all
					fix.
				</Text>
			</View>

			<View style={styles.divider} />

			<View style={styles.personalSection}>
				<View style={styles.sectionHeader}>
					<View style={styles.headerIconAccent}>
						<Ionicons name="sparkles-outline" size={18} color={palette.primary} />
					</View>
					<Text style={styles.eyebrowAccent}>What we do instead</Text>
				</View>
				<View style={styles.principlesStack}>
					{PRINCIPLES.map((principle) => (
						<PrincipleRow key={principle.title} {...principle} />
					))}
				</View>
			</View>
		</View>
	);
}

function PrincipleRow({
	iconName,
	title,
	body,
}: {
	iconName: IoniconName;
	title: string;
	body: string;
}) {
	return (
		<View style={styles.principleRow}>
			<View style={styles.principleIcon}>
				<Ionicons name={iconName} size={20} color={palette.primary} />
			</View>
			<View style={styles.principleCopy}>
				<Text style={styles.principleTitle}>{title}</Text>
				<Text style={styles.principleBody}>{body}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.lg,
		...tokens.shadow.card,
	},
	genericSection: {
		gap: spacing.sm,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	headerIconMuted: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	headerIconAccent: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	eyebrowMuted: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	eyebrowAccent: {
		color: palette.primary,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
	},
	crossedRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	crossedChip: {
		minHeight: 28,
		borderRadius: 14,
		backgroundColor: tokens.color.status.danger.background,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	crossedChipText: {
		color: tokens.color.status.danger.foreground,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 16,
		textDecorationLine: "line-through",
	},
	genericNote: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
	},
	divider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
	},
	personalSection: {
		gap: spacing.sm,
	},
	principlesStack: {
		gap: spacing.sm,
	},
	principleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		minHeight: 62,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.success,
		padding: spacing.sm,
	},
	principleIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	principleCopy: {
		flex: 1,
		gap: 2,
	},
	principleTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	principleBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
});

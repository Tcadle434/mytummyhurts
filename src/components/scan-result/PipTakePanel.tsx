import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { spacing, tokens } from "../../theme";
import { Pip } from "../common/Pip";

// "Pip's take" is the scan result's one hero statement: Pip on the warm
// peach-cream block with ink text and a mint accent. Deliberately local to
// scan results — other screens keep the plain-white PipAnalysisCard.
export function PipTakePanel({ title = "Pip's take", body }: { title?: string; body: string }) {
	return (
		<View style={styles.panel}>
			<View style={styles.header}>
				<View style={styles.pipGlow}>
					<Pip state="subtle" size={44} />
				</View>
				<View style={styles.headerText}>
					<Text style={styles.title}>{title}</Text>
					<Text style={styles.subtitle}>Personalized from your profile</Text>
				</View>
				<Ionicons name="sparkles" size={18} color={tokens.color.accent.mascot} />
			</View>
			<Text style={styles.body}>{body}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	panel: {
		width: "100%",
		backgroundColor: tokens.color.surface.hero.background,
		borderRadius: tokens.radius.xl,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.lift,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	// The soft mint disc is Pip's glow against the card.
	pipGlow: {
		width: 52,
		height: 52,
		borderRadius: tokens.radius.pill,
		backgroundColor: tokens.color.action.quiet.background,
		alignItems: "center",
		justifyContent: "center",
	},
	headerText: {
		flex: 1,
		gap: 2,
	},
	title: {
		...tokens.type.title.block,
		color: tokens.color.surface.hero.onHero,
	},
	subtitle: {
		...tokens.type.body.small,
		color: tokens.color.surface.hero.onHeroMuted,
	},
	body: {
		...tokens.type.body.emphasis,
		color: tokens.color.surface.hero.onHero,
	},
});

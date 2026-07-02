import { StyleSheet } from "react-native";

import { palette, spacing, tokens, type } from "../../theme";

// Shared style objects for the scan-result card components. Deep Garden
// cards are borderless: pure white on porcelain, separated by the soft
// green-cast shadow instead of hairlines. Titles speak in Bricolage via the
// title tokens.
const shared = StyleSheet.create({
	resultCard: {
		width: "100%",
		borderRadius: tokens.radius.xl,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	cardTitle: {
		...tokens.type.title.card,
		color: palette.text,
	},
	sectionLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
});

export const resultCardStyle = shared.resultCard;
export const cardTitleStyle = shared.cardTitle;
export const sectionLabelStyle = shared.sectionLabel;

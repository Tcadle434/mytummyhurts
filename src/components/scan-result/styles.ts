import { StyleSheet } from "react-native";

import { palette, spacing, tokens, type } from "../../theme";

// Shared style objects extracted from the scan-result card components. These
// were previously copy-pasted byte-for-byte across HeroCards, MenuCards,
// ScoreDrivers, and IngredientCards. Values are preserved exactly as they were
// (notably borderRadius: 28, which is a hardcoded literal rather than a theme
// token — see the design note in the refactor report before changing it).
const shared = StyleSheet.create({
	resultCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
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

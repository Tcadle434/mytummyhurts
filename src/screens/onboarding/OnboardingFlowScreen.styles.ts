import { StyleSheet } from "react-native";

import { palette, spacing, tokens, type } from "../../theme";
import { withAlpha } from "../../theme/helpers";

export const styles = StyleSheet.create({
	backgroundLayer: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	backgroundImage: {
		opacity: 1,
	},
	backgroundWash: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: withAlpha(tokens.color.text.primary, 0.1),
	},
	onboardingContent: {
		paddingBottom: spacing.lg,
	},
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	backButton: {
		width: 38,
		height: 38,
		alignItems: "flex-start",
		justifyContent: "center",
	},
	choiceStepShell: {
		gap: spacing.md,
	},
	stepScroll: {
		flex: 1,
	},
	stepScrollContent: {
		flexGrow: 1,
		gap: spacing.lg,
		paddingBottom: spacing.md,
	},
	choiceStepScrollContent: {
		gap: spacing.md,
	},
	imageBackgroundTitle: {
		textShadowColor: withAlpha(tokens.color.surface.hero.deep, 0.38),
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	optionGrid: {
		gap: spacing.sm,
	},
	centerImageSlot: {
		flexGrow: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
	},
	centerImage: {
		borderRadius: 28,
	},
	centerGraphicSlot: {
		flexGrow: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.lg,
	},
	previewStack: {
		gap: spacing.md,
	},
	previewCard: {
		gap: spacing.sm,
	},
	previewTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 17,
	},
	previewBody: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 15,
		lineHeight: 21,
		textAlign: "center",
	},
	previewNote: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	metricRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	footer: {
		paddingTop: spacing.md,
	},
	choiceFooter: {
		paddingTop: spacing.sm,
	},
	footerBody: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 17,
		lineHeight: 25,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	footerBodyOnImage: {
		color: withAlpha(tokens.color.utility.white, 0.9),
		textShadowColor: withAlpha(tokens.color.surface.hero.deep, 0.28),
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 2,
	},
	trialFooterBody: {
		color: palette.primaryDark,
		fontFamily: type.body.semibold,
	},
});

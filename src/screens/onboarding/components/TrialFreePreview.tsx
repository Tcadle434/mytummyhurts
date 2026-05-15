import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

const CREAMY_TOMATO_PASTA_SCAN = require("../../../../assets/ui/creamy_tomato_pasta_scan.png");

export function TrialFreePreview() {
	return (
		<View style={styles.wrap}>
			{/* TODO: Replace this coded scan mock with a real app screenshot asset before release. */}
			<View style={styles.phoneFrame}>
				<View style={styles.phoneTop}>
					<View style={styles.cameraDot} />
					<Text style={styles.phoneTitle}>Scan meal</Text>
					<Ionicons name="sparkles-outline" size={17} color={palette.primary} />
				</View>

				<View style={styles.imageFrame}>
					<Image
						source={CREAMY_TOMATO_PASTA_SCAN}
						style={styles.scanImage}
						resizeMode="cover"
						accessibilityIgnoresInvertColors
					/>
					<View style={styles.scanBadge}>
						<Ionicons name="camera" size={14} color={tokens.color.text.inverse} />
						<Text style={styles.scanBadgeText}>Meal scan</Text>
					</View>
				</View>

				<View style={styles.resultCard}>
					<View style={styles.resultHeader}>
						<View>
							<Text style={styles.dishLabel}>Creamy tomato pasta</Text>
							<Text style={styles.resultSubtext}>Personalized risk estimate</Text>
						</View>
						<View style={styles.scorePill}>
							<Text style={styles.scoreValue}>78</Text>
						</View>
					</View>
					<View style={styles.callout}>
						<Ionicons
							name="alert-circle-outline"
							size={18}
							color={tokens.color.status.risk.high.foreground}
						/>
						<Text style={styles.calloutText}>
							Tomato has shown up on reactive reflux days.
						</Text>
					</View>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		alignItems: "center",
	},
	phoneFrame: {
		width: "82%",
		maxWidth: 300,
		borderRadius: 34,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.sm,
		...tokens.shadow.card,
	},
	phoneTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xs,
	},
	cameraDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: tokens.color.border.strong,
	},
	phoneTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	imageFrame: {
		height: 168,
		borderRadius: 24,
		overflow: "hidden",
		backgroundColor: tokens.color.surface.card.warm,
	},
	scanImage: {
		width: "100%",
		height: "100%",
	},
	scanBadge: {
		position: "absolute",
		left: spacing.sm,
		top: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 999,
		backgroundColor: "rgba(47, 105, 83, 0.88)",
		paddingHorizontal: spacing.sm,
		paddingVertical: 6,
	},
	scanBadgeText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
	},
	resultCard: {
		borderRadius: 22,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.warm,
		padding: spacing.sm,
		gap: spacing.sm,
	},
	resultHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	dishLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	resultSubtext: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 11,
		lineHeight: 15,
	},
	scorePill: {
		width: 48,
		height: 48,
		borderRadius: 16,
		backgroundColor: tokens.color.status.risk.high.background,
		alignItems: "center",
		justifyContent: "center",
	},
	scoreValue: {
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.bold,
		fontSize: 21,
		lineHeight: 24,
	},
	callout: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
		borderRadius: 16,
		backgroundColor: tokens.color.status.risk.high.background,
		padding: spacing.sm,
	},
	calloutText: {
		flex: 1,
		color: tokens.color.status.risk.high.foreground,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
});

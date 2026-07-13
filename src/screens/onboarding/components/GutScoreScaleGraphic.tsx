import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { GutScoreInfoCards } from "../../../components/gut-score/GutScoreInfoCards";
import { spacing, tokens, type } from "../../../theme";

export function GutScoreScaleGraphic() {
	return (
		<View style={styles.educationCard}>
			<View style={styles.educationScoreHeader}>
				<View>
					<Text style={styles.educationEyebrow}>Gut Score</Text>
					<Text style={styles.educationCardTitle}>Overall rating</Text>
				</View>
				<Text
					style={[
						styles.educationScoreValue,
						// Text-grade foreground, never the tint: the tint is a fill color
						// and fails contrast as text on the white card.
						{ color: tokens.color.status.risk.medium.foreground },
					]}
				>
					42
					<Text style={styles.educationScoreScale}>/100</Text>
				</Text>
			</View>
			<View style={styles.gutScoreScaleTrack}>
				<View
					style={[
						styles.gutScoreScaleSegment,
						styles.gutScoreScaleStart,
						{ backgroundColor: tokens.color.status.risk.high.tint },
					]}
				/>
				<View
					style={[
						styles.gutScoreScaleSegment,
						{ backgroundColor: tokens.color.status.risk.medium.tint },
					]}
				/>
				<View
					style={[
						styles.gutScoreScaleSegment,
						styles.gutScoreScaleEnd,
						{ backgroundColor: tokens.color.status.risk.low.tint },
					]}
				/>
			</View>
			<View style={styles.scaleLabelRow}>
				<Text
					style={[
						styles.scaleEndpointLabel,
						{ color: tokens.color.status.risk.high.foreground },
					]}
				>
					Reactive
				</Text>
				<Text
					style={[
						styles.scaleEndpointLabel,
						{ color: tokens.color.status.risk.low.foreground },
					]}
				>
					Calmer
				</Text>
			</View>
			<GutScoreInfoCards />
			<View style={styles.educationSignalRow}>
				<View style={styles.educationIconBadge}>
					<Ionicons name="trending-up" size={18} color={tokens.color.status.risk.low.foreground} />
				</View>
				<Text style={styles.educationSignalText}>
					Higher means your gut looks more stable over time. Raise your score!
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	educationCard: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	educationScoreHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	educationEyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	educationCardTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 19,
		lineHeight: 24,
	},
	educationScoreValue: {
		fontFamily: type.body.bold,
		fontSize: 52,
		lineHeight: 58,
		fontVariant: ["tabular-nums"],
	},
	educationScoreScale: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 18,
		lineHeight: 22,
	},
	gutScoreScaleTrack: {
		height: 14,
		flexDirection: "row",
		gap: 3,
	},
	gutScoreScaleSegment: {
		flex: 1,
	},
	gutScoreScaleStart: {
		borderTopLeftRadius: 99,
		borderBottomLeftRadius: 99,
	},
	gutScoreScaleEnd: {
		borderTopRightRadius: 99,
		borderBottomRightRadius: 99,
	},
	scaleLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: -spacing.xs,
	},
	scaleEndpointLabel: {
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 19,
	},
	educationSignalRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		backgroundColor: tokens.color.status.success.background,
		padding: spacing.md,
	},
	educationIconBadge: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	educationSignalText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 14,
		lineHeight: 20,
	},
});

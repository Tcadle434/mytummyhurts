import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from "react-native";

import { spacing, tokens, type } from "../../../theme";

const PIP_JOYOUS = require("../../../../assets/pip/pip_joyous_transparent.png");
const CONFIDENCE_BACK_ICON = require("../../../../assets/ui/confidence_back_icon.png");
const HEALTH_BACK_ICON = require("../../../../assets/ui/health_back_icon.png");
const LIFE_BACK_ICON = require("../../../../assets/ui/life_back_icon.png");

export function HealingPromiseGraphic() {
	return (
		<View style={styles.promiseGraphic}>
			<View style={styles.promiseHeroCard}>
				<View style={styles.promiseHeroGlow} />
				<Image
					source={PIP_JOYOUS}
					style={styles.promisePip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling better"
				/>
				<View style={styles.promiseHeroAccent}>
					<Ionicons name="trending-up" size={19} color={tokens.color.icon.accent} />
					<Text style={styles.promiseHeroAccentText}>Small steps. Real progress.</Text>
				</View>
			</View>

			<View style={styles.promiseCardRow}>
				<PromiseOutcomeCard
					imageSource={CONFIDENCE_BACK_ICON}
					title="Confidence"
					body="Feel like yourself again."
				/>
				<PromiseOutcomeCard
					imageSource={HEALTH_BACK_ICON}
					title="Health"
					body="Stronger gut. More energy."
				/>
				<PromiseOutcomeCard
					imageSource={LIFE_BACK_ICON}
					title="Life"
					body="More freedom. More you."
				/>
			</View>
		</View>
	);
}

type PromiseOutcomeCardProps = {
	imageSource: ImageSourcePropType;
	title: string;
	body: string;
};

function PromiseOutcomeCard({ imageSource, title, body }: PromiseOutcomeCardProps) {
	return (
		<View style={styles.promiseOutcomeCard}>
			<Image
				source={imageSource}
				style={styles.promiseOutcomeIcon}
				resizeMode="contain"
				accessibilityIgnoresInvertColors
			/>
			<Text style={styles.promiseOutcomeTitle}>{title}</Text>
			<View style={styles.promiseDividerMark} />
			<Text style={styles.promiseOutcomeBody}>{body}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	promiseGraphic: {
		width: "100%",
		maxWidth: 360,
		gap: spacing.md,
	},
	promiseHeroCard: {
		height: 206,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.frosted,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		...tokens.shadow.card,
	},
	promiseHeroGlow: {
		position: "absolute",
		width: 226,
		height: 126,
		borderRadius: 80,
		backgroundColor: tokens.color.status.success.background,
		bottom: 20,
	},
	promisePip: {
		width: 164,
		height: 164,
		marginTop: -spacing.sm,
	},
	promiseHeroAccent: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		bottom: spacing.md,
		minHeight: 36,
		borderRadius: 18,
		backgroundColor: tokens.color.surface.card.default,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.md,
	},
	promiseHeroAccentText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 17,
	},
	promiseCardRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	promiseOutcomeCard: {
		flex: 1,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		...tokens.shadow.card,
	},
	promiseOutcomeIcon: {
		width: 72,
		height: 72,
		marginBottom: spacing.xs,
	},
	promiseOutcomeTitle: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 17,
		textAlign: "center",
	},
	promiseDividerMark: {
		width: 26,
		height: 2,
		borderRadius: 2,
		backgroundColor: tokens.color.accent.mascotAccent,
		marginVertical: 5,
	},
	promiseOutcomeBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 10,
		lineHeight: 13,
		textAlign: "center",
	},
});

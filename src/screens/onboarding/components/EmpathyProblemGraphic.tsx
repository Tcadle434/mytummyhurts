import {
	Image,
	type ImageSourcePropType,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";

import { spacing, tokens, type } from "../../../theme";

const PIP_ANXIOUS = require("../../../../assets/pip/pip_anxious_transparent.png");
const EATING_OUT_ICON = require("../../../../assets/ui/eating_out_icon.png");
const TRAVELLING_ICON = require("../../../../assets/ui/travelling_icon.png");
const LEAVING_HOUSE_ICON = require("../../../../assets/ui/leaving_house_icon.png");
const HEALTH_ANXIETY_ICON = require("../../../../assets/ui/health_anxiety_icon.png");

export function EmpathyProblemGraphic() {
	return (
		<View style={styles.graphic}>
			<View style={styles.sceneCard}>
				<View style={styles.pipHalo} />
				<Image
					source={PIP_ANXIOUS}
					style={styles.pip}
					resizeMode="contain"
					accessibilityLabel="Pip feeling anxious"
				/>
				<EmpathyConcernCard
					imageSource={EATING_OUT_ICON}
					label="Worried to eat out"
					positionStyle={styles.concernTopLeft}
				/>
				<EmpathyConcernCard
					imageSource={TRAVELLING_ICON}
					label="Nervous to travel"
					positionStyle={styles.concernTopRight}
				/>
				<EmpathyConcernCard
					imageSource={LEAVING_HOUSE_ICON}
					label="Scared to leave your house"
					positionStyle={styles.concernBottomLeft}
				/>
				<EmpathyConcernCard
					imageSource={HEALTH_ANXIETY_ICON}
					label="Anxious about your health"
					positionStyle={styles.concernBottomRight}
				/>
			</View>
		</View>
	);
}

type EmpathyConcernCardProps = {
	imageSource: ImageSourcePropType;
	label: string;
	positionStyle: StyleProp<ViewStyle>;
};

function EmpathyConcernCard({
	imageSource,
	label,
	positionStyle,
}: EmpathyConcernCardProps) {
	return (
		<View style={[styles.concernCard, positionStyle]}>
			<View style={styles.concernIconSlot}>
				<Image
					source={imageSource}
					style={styles.concernIcon}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>
			<Text style={styles.concernText}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	graphic: {
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
	},
	sceneCard: {
		width: "100%",
		height: 354,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		overflow: "hidden",
		...tokens.shadow.card,
	},
	pipHalo: {
		position: "absolute",
		left: 86,
		top: 82,
		width: 188,
		height: 188,
		borderRadius: 94,
		backgroundColor: tokens.color.status.success.background,
	},
	pip: {
		position: "absolute",
		left: 89,
		top: 76,
		width: 182,
		height: 182,
		zIndex: 2,
	},
	concernCard: {
		position: "absolute",
		width: 116,
		minHeight: 124,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 24,
		backgroundColor: tokens.color.surface.frosted,
		alignItems: "center",
		justifyContent: "flex-start",
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: spacing.xs,
		gap: 0,
		...tokens.shadow.card,
		zIndex: 3,
	},
	concernTopLeft: {
		left: spacing.sm,
		top: spacing.md,
	},
	concernTopRight: {
		right: spacing.sm,
		top: spacing.md,
	},
	concernBottomLeft: {
		left: spacing.sm,
		bottom: spacing.md,
	},
	concernBottomRight: {
		right: spacing.sm,
		bottom: spacing.md,
	},
	concernIconSlot: {
		width: "100%",
		height: 88,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
	},
	concernIcon: {
		width: 142,
		height: 142,
	},
	concernText: {
		color: tokens.color.text.accent,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
		paddingHorizontal: spacing.xs,
		paddingTop: spacing.xs,
	},
});

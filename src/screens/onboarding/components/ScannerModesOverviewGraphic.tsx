import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Image, ImageSourcePropType, StyleSheet, Text, View } from "react-native";

import { spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const MULTI_PURPOSE_FOOD_SCANNER = require("../../../../assets/ui/multi_purpose_food_scanner.png");
const MULTI_PURPOSE_MENU_SCANNER = require("../../../../assets/ui/multi_purpose_menu_scanner.png");
const MULTI_PURPOSE_BARCODE_SCANNER = require("../../../../assets/ui/multi_purpose_barcode_scanner.png");

/**
 * One-screen scanner-mode overview used in onboarding. The real scanner flows
 * are intentionally separate; this component only explains the three modes.
 */
export function ScannerModesOverviewGraphic() {
	return (
		<View style={styles.card}>
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_FOOD_SCANNER}
				iconName="camera-outline"
				title="Scan meals"
				body="Turn food into personalized risk scores."
			/>
			<View style={styles.divider} />
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_MENU_SCANNER}
				iconName="restaurant-outline"
				title="Scan menus"
				body="See the top 3 best and worst items for your gut."
			/>
			<View style={styles.divider} />
			<ScannerModeRow
				imageSource={MULTI_PURPOSE_BARCODE_SCANNER}
				iconName="barcode-outline"
				title="Scan barcodes"
				body="Check risk, preservatives, seed oils, and more."
			/>
		</View>
	);
}

function ScannerModeRow({
	imageSource,
	iconName,
	title,
	body,
}: {
	imageSource: ImageSourcePropType;
	iconName: IoniconName;
	title: string;
	body: string;
}) {
	return (
		<View style={styles.row}>
			<View style={styles.imageSlot}>
				<Image
					source={imageSource}
					style={styles.image}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>
			<View style={styles.copy}>
				<View style={styles.iconBadge}>
					<Ionicons name={iconName} size={21} color={tokens.color.icon.accent} />
				</View>
				<View style={styles.textStack}>
					<Text style={styles.title}>{title}</Text>
					<Text style={styles.body}>{body}</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.sm,
		...tokens.shadow.card,
	},
	row: {
		minHeight: 128,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.xs,
		paddingHorizontal: spacing.xs,
	},
	imageSlot: {
		width: 140,
		height: 116,
		alignItems: "center",
		justifyContent: "center",
	},
	image: {
		width: "100%",
		height: "100%",
	},
	copy: {
		flex: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	iconBadge: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	textStack: {
		flex: 1,
		gap: spacing.xs,
		paddingTop: 2,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	body: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 20,
	},
	divider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
		marginHorizontal: spacing.md,
	},
});

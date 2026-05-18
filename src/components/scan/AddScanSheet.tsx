import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../modals/BottomSheet";
import { navigationRef } from "../../navigation/navigationRef";
import { trackEvent } from "../../services/analytics";
import { palette, radii, spacing, tokens, type } from "../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type AddScanAction =
	| "take-photo"
	| "upload-photo"
	| "describe-meal"
	| "scan-menu"
	| "scan-barcode";

type AddScanSheetProps = {
	visible: boolean;
	onClose: () => void;
	entryPoint?: string;
};

export function AddScanSheet({ visible, onClose, entryPoint }: AddScanSheetProps) {
	function handleSelect(action: AddScanAction) {
		onClose();
		if (!navigationRef.isReady()) return;
		trackEvent("add_scan_action_selected", { action, entry_point: entryPoint });

		switch (action) {
			case "take-photo":
				navigationRef.navigate("ScanCapture", {
					sourceType: "camera",
					manualMode: false,
					scanCategory: "food",
				});
				return;
			case "upload-photo":
				navigationRef.navigate("ScanCapture", {
					sourceType: "upload",
					manualMode: false,
					scanCategory: "food",
				});
				return;
			case "describe-meal":
				navigationRef.navigate("ManualMeal", {});
				return;
			case "scan-menu":
				navigationRef.navigate("ScanCapture", {
					sourceType: "camera",
					manualMode: false,
					scanCategory: "menu",
				});
				return;
			case "scan-barcode":
				navigationRef.navigate("ScanCapture", {
					sourceType: "camera",
					manualMode: false,
					scanCategory: "grocery",
				});
				return;
		}
	}

	return (
		<BottomSheet visible={visible} onClose={onClose}>
			<Text style={styles.title}>Add a scan</Text>

			<PrimaryAction
				iconName="camera-outline"
				label="Take a photo"
				onPress={() => handleSelect("take-photo")}
			/>

			<View style={styles.row}>
				<SecondaryAction
					iconName="image-outline"
					label="Upload photo"
					onPress={() => handleSelect("upload-photo")}
				/>
				<SecondaryAction
					iconName="create-outline"
					label="Describe meal"
					onPress={() => handleSelect("describe-meal")}
				/>
			</View>

			<View style={styles.divider} />

			<Text style={styles.sectionLabel}>Other scan types</Text>

			<View style={styles.row}>
				<TertiaryAction
					iconName="restaurant-outline"
					label="Scan a menu"
					onPress={() => handleSelect("scan-menu")}
				/>
				<TertiaryAction
					iconName="barcode-outline"
					label="Scan a barcode"
					onPress={() => handleSelect("scan-barcode")}
				/>
			</View>
		</BottomSheet>
	);
}

function PrimaryAction({
	iconName,
	label,
	onPress,
}: {
	iconName: IoniconName;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.9 }]}
		>
			<View style={styles.primaryIcon}>
				<Ionicons name={iconName} size={22} color={tokens.color.action.primary.foreground} />
			</View>
			<Text style={styles.primaryLabel}>{label}</Text>
			<Ionicons
				name="chevron-forward"
				size={18}
				color={tokens.color.action.primary.foreground}
			/>
		</Pressable>
	);
}

function SecondaryAction({
	iconName,
	label,
	onPress,
}: {
	iconName: IoniconName;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.86 }]}
		>
			<View style={styles.secondaryIcon}>
				<Ionicons name={iconName} size={20} color={palette.primary} />
			</View>
			<Text style={styles.secondaryLabel}>{label}</Text>
		</Pressable>
	);
}

function TertiaryAction({
	iconName,
	label,
	onPress,
}: {
	iconName: IoniconName;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			onPress={onPress}
			style={({ pressed }) => [styles.tertiaryAction, pressed && { opacity: 0.86 }]}
		>
			<View style={styles.tertiaryIcon}>
				<Ionicons name={iconName} size={18} color={tokens.color.icon.primary} />
			</View>
			<Text style={styles.tertiaryLabel}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 26,
		letterSpacing: -0.2,
	},
	primaryAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		minHeight: 64,
		borderRadius: radii.lg,
		backgroundColor: palette.primary,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	primaryIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	primaryLabel: {
		flex: 1,
		color: tokens.color.action.primary.foreground,
		fontFamily: type.body.bold,
		fontSize: 17,
		lineHeight: 22,
	},
	row: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	secondaryAction: {
		flex: 1,
		minHeight: 84,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		gap: spacing.xs,
	},
	secondaryIcon: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border.subtle,
		marginVertical: spacing.xs,
	},
	sectionLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		letterSpacing: 0.8,
		textTransform: "uppercase",
		marginBottom: -spacing.xs,
	},
	tertiaryAction: {
		flex: 1,
		minHeight: 64,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		gap: 6,
	},
	tertiaryIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	tertiaryLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 17,
	},
});

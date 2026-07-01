import { Ionicons } from "@expo/vector-icons";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { InputField, PrimaryButton } from "../common/UI";
import { radii, spacing, tokens, type } from "../../theme";

interface CustomEntryModalProps {
	visible: boolean;
	title: string;
	subtitle?: string;
	placeholder: string;
	value: string;
	onChangeText: (text: string) => void;
	onSubmit: () => void;
	onClose: () => void;
	values: string[];
	onRemove: (value: string) => void;
}

export function CustomEntryModal({
	visible,
	title,
	subtitle,
	placeholder,
	value,
	onChangeText,
	onSubmit,
	onClose,
	values,
	onRemove,
}: CustomEntryModalProps) {
	return (
		<Modal
			animationType="fade"
			transparent
			visible={visible}
			onRequestClose={onClose}
		>
			<View style={styles.customModalRoot}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Close custom entry"
					style={styles.customModalBackdrop}
					onPress={onClose}
				/>
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
					pointerEvents="box-none"
					style={styles.customModalKeyboard}
				>
					<View style={styles.customModalCard}>
						<View style={styles.customModalHeader}>
							<View style={styles.customModalTitleWrap}>
								<Text style={styles.customModalTitle}>{title}</Text>
								{subtitle ? (
									<Text style={styles.customModalSubtitle}>{subtitle}</Text>
								) : null}
							</View>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Close"
								onPress={onClose}
								hitSlop={8}
								style={({ pressed }) => [
									styles.customModalClose,
									pressed && { opacity: 0.7 },
								]}
							>
								<Ionicons
									name="close"
									size={20}
									color={tokens.color.icon.primary}
								/>
							</Pressable>
						</View>
						<InputField
							value={value}
							placeholder={placeholder}
							onChangeText={onChangeText}
							autoFocus
						/>
						<PrimaryButton
							label="Add"
							onPress={onSubmit}
							disabled={!value.trim()}
						/>
						{values.length > 0 ? (
							<View style={styles.customValuesStack}>
								{values.map((entry) => (
									<View key={entry} style={styles.customValueChip}>
										<Text style={styles.customValueText} numberOfLines={1}>
											{entry}
										</Text>
										<Pressable
											accessibilityRole="button"
											accessibilityLabel={`Remove ${entry}`}
											onPress={() => onRemove(entry)}
											hitSlop={8}
											style={({ pressed }) => [
												styles.customValueRemove,
												pressed && { opacity: 0.7 },
											]}
										>
											<Ionicons
												name="close"
												size={14}
												color={tokens.color.status.verdict.watching.foreground}
											/>
										</Pressable>
									</View>
								))}
							</View>
						) : null}
					</View>
				</KeyboardAvoidingView>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	customModalRoot: {
		flex: 1,
		backgroundColor: tokens.color.overlay.scrim,
	},
	customModalBackdrop: {
		...StyleSheet.absoluteFillObject,
		zIndex: 0,
	},
	customModalKeyboard: {
		flex: 1,
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		padding: spacing.lg,
		zIndex: 1,
	},
	customModalCard: {
		width: "100%",
		maxWidth: 380,
		zIndex: 2,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.sheet,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.modal,
	},
	customModalHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
	},
	customModalTitleWrap: {
		flex: 1,
		gap: spacing.xs,
	},
	customModalTitle: {
		...tokens.type.title.card,
		color: tokens.color.text.primary,
	},
	customModalSubtitle: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 20,
	},
	customModalClose: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	customValuesStack: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	// Added entries stay quiet: neutral watching-tone chips, never a stack of
	// saturated pills. The input remains the focal point of the dialog.
	customValueChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		minHeight: 34,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.verdict.watching.background,
		paddingHorizontal: spacing.sm,
	},
	customValueText: {
		flexShrink: 1,
		color: tokens.color.status.verdict.watching.foreground,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	customValueRemove: {
		alignItems: "center",
		justifyContent: "center",
	},
});

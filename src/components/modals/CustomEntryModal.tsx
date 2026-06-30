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
import { palette, spacing, tokens, type } from "../../theme";

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
									<View key={entry} style={styles.customValuePill}>
										<Text style={styles.customValueText}>{entry}</Text>
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
												size={13}
												color={tokens.color.text.inverse}
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
		backgroundColor: "rgba(22, 29, 33, 0.44)",
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
		borderRadius: 24,
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
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
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
		gap: spacing.sm,
	},
	customValuePill: {
		minHeight: 50,
		borderRadius: 18,
		backgroundColor: palette.primary,
		paddingHorizontal: spacing.md,
		paddingVertical: 13,
		paddingRight: 42,
		justifyContent: "center",
		position: "relative",
	},
	customValueText: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 20,
	},
	customValueRemove: {
		position: "absolute",
		top: 8,
		right: 8,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
});

import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text } from "react-native";

import { Pip } from "../common/Pip";
import { components, spacing, tokens, type PipState } from "../../theme";

type InfoModalProps = {
	visible: boolean;
	onClose: () => void;
	title: string;
	body?: string;
	children?: ReactNode;
	accessibilityLabel: string;
	ctaLabel?: string;
	ctaColor?: string;
	pipState?: PipState;
	pipSize?: number;
};

export function InfoModal({
	visible,
	onClose,
	title,
	body,
	children,
	accessibilityLabel,
	ctaLabel = "Got it",
	ctaColor = tokens.color.accent.brand,
	pipState = "thinking",
	pipSize = 86,
}: InfoModalProps) {
	return (
		<Modal
			animationType="fade"
			transparent
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable
					accessibilityViewIsModal
					accessibilityLabel={accessibilityLabel}
					style={styles.card}
					onPress={(event) => event.stopPropagation()}
				>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Close ${title}`}
						hitSlop={10}
						onPress={onClose}
						style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.72 }]}
					>
						<Ionicons name="close" size={18} color={tokens.color.icon.primary} />
					</Pressable>
					<Pip state={pipState} size={pipSize} style={styles.pip} />
					<Text style={styles.title}>{title}</Text>
					{body ? <Text style={styles.body}>{body}</Text> : null}
					{children}
					<InfoModalButton text={ctaLabel} color={ctaColor} onPress={onClose} />
				</Pressable>
			</Pressable>
		</Modal>
	);
}

type InfoModalButtonProps = {
	text: string;
	color: string;
	onPress: () => void;
};

function InfoModalButton({ text, color, onPress }: InfoModalButtonProps) {
	return (
		<Pressable
			accessibilityRole="button"
			onPress={onPress}
			style={({ pressed }) => [
				styles.modalButton,
				{ backgroundColor: color },
				pressed && { opacity: 0.86 },
			]}
		>
			<Text style={styles.modalButtonText}>{text}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.overlay.scrim,
		paddingHorizontal: spacing.lg,
	},
	card: {
		...components.card.default,
		width: "100%",
		maxWidth: 360,
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.xl,
		paddingBottom: spacing.lg,
		gap: spacing.sm,
	},
	closeButton: {
		position: "absolute",
		right: spacing.md,
		top: spacing.md,
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: tokens.color.surface.card.warm,
		alignItems: "center",
		justifyContent: "center",
	},
	pip: {
		marginBottom: spacing.xs,
	},
	// The modal exists to explain something the app concluded — the title is a
	// finding, so it gets the Bricolage accent face.
	title: {
		...tokens.type.display.accent,
		color: tokens.color.text.primary,
		textAlign: "center",
	},
	body: {
		...tokens.type.body.default,
		color: tokens.color.text.secondary,
		textAlign: "center",
	},
	modalButton: {
		width: "72%",
		minHeight: 52,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: tokens.radius.pill,
		paddingHorizontal: spacing.xl,
		marginTop: spacing.sm,
		...tokens.shadow.card,
	},
	modalButtonText: {
		...tokens.type.label.button,
		color: tokens.color.text.inverse,
		textAlign: "center",
	},
});

import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { GutScoreInfoCards } from "../../components/gut-score/GutScoreInfoCards";
import { Pip } from "../../components/common/Pip";
import { components, spacing, tokens } from "../../theme";

type GutScoreInfoModalProps = {
	visible: boolean;
	onClose: () => void;
};

const gutScoreScaleSegments = [
	{
		id: "reactive",
		number: "0",
		color: tokens.color.status.risk.high.foreground,
		tint: tokens.color.status.risk.high.tint,
	},
	{
		id: "mixed",
		number: "50",
		color: tokens.color.status.risk.medium.foreground,
		tint: tokens.color.status.risk.medium.tint,
	},
	{
		id: "calmer",
		number: "100",
		color: tokens.color.status.risk.low.foreground,
		tint: tokens.color.status.risk.low.tint,
	},
];

export function GutScoreInfoModal({ visible, onClose }: GutScoreInfoModalProps) {
	return (
		<Modal
			animationType="fade"
			transparent
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent
		>
			<Pressable style={styles.overlay} onPress={onClose}>
				<Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Close Gut Score explanation"
						hitSlop={10}
						onPress={onClose}
						style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.72 }]}
					>
						<Ionicons name="close" size={18} color={tokens.color.icon.primary} />
					</Pressable>
					<Pip state="thinking" size={86} style={styles.pip} />
					<Text style={styles.title}>What is Gut Score?</Text>
					<Text style={styles.body}>
						A simple signal of how calm and resilient your gut seems right now.
					</Text>
					<GutScoreScale />
					<GutScoreInfoCards />
					<View style={styles.accuracyNote}>
						<Ionicons
							name="sparkles-outline"
							size={20}
							color={tokens.color.accent.brand}
						/>
						<Text style={styles.accuracyNoteText}>
							Your score will get more accurate over time.
						</Text>
					</View>
					<GutScoreModalButton
						text="Got it"
						color={tokens.color.accent.brand}
						onPress={onClose}
					/>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

type GutScoreModalButtonProps = {
	text: string;
	color: string;
	onPress: () => void;
};

function GutScoreModalButton({ text, color, onPress }: GutScoreModalButtonProps) {
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

function GutScoreScale() {
	return (
		<View
			style={styles.scaleWrap}
			accessible
			accessibilityLabel="Gut Score scale. Zero to thirty-three is reactive. Thirty-four to sixty-six is mixed. Sixty-seven to one hundred is calmer."
		>
			<View style={styles.scaleNumbers}>
				{gutScoreScaleSegments.map((segment) => (
					<Text key={segment.id} style={[styles.scaleNumber, { color: segment.color }]}>
						{segment.number}
					</Text>
				))}
			</View>
			<View style={styles.scaleTrack}>
				{gutScoreScaleSegments.map((segment, index) => (
					<View key={segment.id} style={styles.scaleSegmentWrap}>
						<View
							style={[
								styles.scaleSegment,
								index === 0 && styles.scaleSegmentStart,
								index === gutScoreScaleSegments.length - 1 &&
									styles.scaleSegmentEnd,
								{ backgroundColor: segment.tint },
							]}
						/>
						{index < gutScoreScaleSegments.length - 1 ? (
							<View style={styles.scaleDivider} />
						) : null}
					</View>
				))}
			</View>
			<View style={styles.scaleLabels}>
				<Text
					style={[
						styles.scaleEndLabel,
						styles.scaleEndLabelLeft,
						{ color: tokens.color.status.risk.high.foreground },
					]}
				>
					Reactive
				</Text>
				<Text
					style={[
						styles.scaleEndLabel,
						styles.scaleEndLabelRight,
						{ color: tokens.color.status.risk.low.foreground },
					]}
				>
					Calmer
				</Text>
			</View>
		</View>
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
		backgroundColor: tokens.color.surface.frosted,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		alignItems: "center",
		justifyContent: "center",
	},
	pip: {
		marginBottom: spacing.xs,
	},
	title: {
		...tokens.type.title.screen,
		color: tokens.color.text.primary,
		textAlign: "center",
	},
	body: {
		...tokens.type.body.default,
		color: tokens.color.text.secondary,
		textAlign: "center",
	},
	scaleWrap: {
		width: "100%",
		marginTop: spacing.sm,
		gap: spacing.xs,
	},
	scaleNumbers: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingHorizontal: 2,
	},
	scaleNumber: {
		...tokens.type.body.strong,
	},
	scaleTrack: {
		height: 12,
		flexDirection: "row",
		overflow: "hidden",
		borderRadius: tokens.radius.pill,
	},
	scaleSegmentWrap: {
		flex: 1,
		flexDirection: "row",
	},
	scaleSegment: {
		flex: 1,
	},
	scaleSegmentStart: {
		borderTopLeftRadius: tokens.radius.pill,
		borderBottomLeftRadius: tokens.radius.pill,
	},
	scaleSegmentEnd: {
		borderTopRightRadius: tokens.radius.pill,
		borderBottomRightRadius: tokens.radius.pill,
	},
	scaleDivider: {
		width: 3,
		backgroundColor: tokens.color.surface.card.default,
	},
	scaleLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: spacing.xs,
	},
	scaleEndLabel: {
		...tokens.type.body.strong,
		flex: 1,
	},
	scaleEndLabelLeft: {
		textAlign: "left",
	},
	scaleEndLabelRight: {
		textAlign: "right",
	},
	accuracyNote: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		marginTop: spacing.xs,
	},
	accuracyNoteText: {
		...tokens.type.body.small,
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

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { GutScoreInfoCards } from "../../components/gut-score/GutScoreInfoCards";
import { InfoModal } from "../../components/modals/InfoModal";
import { spacing, tokens } from "../../theme";

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
		<InfoModal
			visible={visible}
			onClose={onClose}
			title="What is Gut Score?"
			body="A simple signal of how calm and resilient your gut seems right now."
			accessibilityLabel="Gut Score explanation"
			ctaLabel="Got it"
		>
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
		</InfoModal>
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
});

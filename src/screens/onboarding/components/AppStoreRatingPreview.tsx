import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SectionCard } from "../../../components/common/UI";
import { palette, spacing, tokens } from "../../../theme";

type AppStoreRatingPreviewProps = {
	busy?: boolean;
	onSkip: () => void;
};

const STAR_COUNT = 5;

export function AppStoreRatingPreview({ busy = false, onSkip }: AppStoreRatingPreviewProps) {
	return (
		<View style={styles.wrap}>
			<SectionCard style={styles.card}>
				<View style={styles.iconCircle}>
					<Ionicons name="heart" size={24} color={tokens.color.icon.inverse} />
				</View>
				<View
					accessibilityRole="image"
					accessibilityLabel="Five star rating"
					style={styles.starsRow}
				>
					{Array.from({ length: STAR_COUNT }).map((_, index) => (
						<Ionicons
							key={index}
							name="star"
							size={34}
							color={tokens.color.accent.warm}
						/>
					))}
				</View>
				<Text style={styles.title}>Rate MyTummyHurts 5 stars</Text>
				<Text style={styles.body}>
					If MyTummyHurts already feels useful, your rating helps more people find
					gut clarity before they eat.
				</Text>
			</SectionCard>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Skip rating"
				disabled={busy}
				onPress={onSkip}
				style={({ pressed }) => [
					styles.skipButton,
					(pressed || busy) && { opacity: pressed ? 0.7 : 0.45 },
				]}
			>
				<Text style={styles.skipLabel}>Skip for now</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		gap: spacing.md,
		alignItems: "center",
	},
	card: {
		width: "100%",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.xl,
	},
	iconCircle: {
		width: 56,
		height: 56,
		borderRadius: 28,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: palette.primary,
	},
	starsRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	title: {
		...tokens.type.title.card,
		textAlign: "center",
		letterSpacing: 0,
		color: tokens.color.text.primary,
	},
	body: {
		...tokens.type.body.default,
		maxWidth: 290,
		textAlign: "center",
		color: tokens.color.text.secondary,
	},
	skipButton: {
		minHeight: 44,
		paddingHorizontal: spacing.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	skipLabel: {
		...tokens.type.label.button,
		letterSpacing: 0,
		color: tokens.color.text.secondary,
	},
});

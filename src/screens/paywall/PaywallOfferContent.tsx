import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Pip } from "../../components/common/Pip";
import { PrimaryButton } from "../../components/common/UI";
import { SubscriptionPlan } from "../../types/domain";
import { palette, radii, spacing, tokens, type } from "../../theme";

const MTH_TEXT_LOGO = require("../../../assets/mth_text_logo.png");

const PLAN_COPY: Record<
	SubscriptionPlan,
	{ title: string; price: string; detail: string; badge?: string }
> = {
	monthly: {
		title: "Monthly",
		price: "$6.99/mo",
		detail: "Flexible monthly access",
	},
	annual: {
		title: "Yearly",
		price: "$34.99/yr",
		detail: "Best value for healing over time",
		badge: "Best value",
	},
};

type PaywallOfferContentProps = {
	selectedPlan: SubscriptionPlan;
	busy: boolean;
	onSelectPlan: (plan: SubscriptionPlan) => void;
	onContinue: () => void;
	onRestore: () => void;
	onTerms: () => void;
	onPrivacy: () => void;
	onBack?: () => void;
	statusMessage?: string | null;
};

export function PaywallOfferContent({
	selectedPlan,
	busy,
	onSelectPlan,
	onContinue,
	onRestore,
	onTerms,
	onPrivacy,
	onBack,
	statusMessage,
}: PaywallOfferContentProps) {
	return (
		<View style={styles.root}>
			<View style={styles.headerRow}>
				{onBack ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Back to onboarding"
						onPress={onBack}
						hitSlop={8}
						style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.72 }]}
					>
						<Ionicons name="chevron-back" size={24} color={palette.primary} />
					</Pressable>
				) : (
					<View style={styles.headerSide} />
				)}
				<View style={styles.logoWrap}>
					<Image
						source={MTH_TEXT_LOGO}
						style={styles.logo}
						resizeMode="contain"
						accessibilityIgnoresInvertColors
					/>
					<Text style={styles.tagline}>Finally heal your gut</Text>
					<Pip state="joy" size={96} style={styles.pip} />
				</View>
				<View style={styles.headerSide} />
			</View>

			<View style={styles.trustBlock}>
				<View style={styles.trustRow}>
					<TrustMetric
						value="4.9"
						label="stars"
						iconName="star"
						iconColor={tokens.color.status.risk.medium.tint}
					/>
					<TrustMetric
						value="10k+"
						label="users"
						iconName="people"
						iconColor={palette.primary}
					/>
				</View>
				<Text style={styles.trustedText}>Trusted by thousands fixing gut health.</Text>
			</View>

			<View style={styles.promiseBlock}>
				<Text style={styles.promiseTitle}>Get your life back, start free today</Text>
				<View style={styles.trialPill}>
					<Ionicons name="sparkles" size={17} color={palette.primary} />
					<Text style={styles.trialText}>7-day free trial</Text>
				</View>
			</View>

			<View style={styles.planList}>
				{(["annual", "monthly"] as const).map((plan) => (
					<PlanRow
						key={plan}
						plan={plan}
						selected={selectedPlan === plan}
						onPress={() => onSelectPlan(plan)}
					/>
				))}
			</View>

			<View style={styles.ctaBlock}>
				<PrimaryButton
					label={busy ? "Continuing..." : "Continue"}
					onPress={onContinue}
					disabled={busy}
				/>
				{statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
				<View style={styles.legalRow}>
					<LegalAction label="Terms" onPress={onTerms} />
					<Text style={styles.legalDot}>•</Text>
					<LegalAction label="Privacy Policy" onPress={onPrivacy} />
					<Text style={styles.legalDot}>•</Text>
					<LegalAction label="Restore" onPress={onRestore} />
				</View>
			</View>
		</View>
	);
}

function TrustMetric({
	value,
	label,
	iconName,
	iconColor,
}: {
	value: string;
	label: string;
	iconName: keyof typeof Ionicons.glyphMap;
	iconColor: string;
}) {
	return (
		<View style={styles.trustMetric}>
			<View style={styles.metricCenter}>
				<View style={styles.metricIconRow}>
					<Ionicons name={iconName} size={15} color={iconColor} />
					<Text style={styles.metricValue}>{value}</Text>
				</View>
				<Text style={styles.metricLabel}>{label}</Text>
			</View>
		</View>
	);
}

function PlanRow({
	plan,
	selected,
	onPress,
}: {
	plan: SubscriptionPlan;
	selected: boolean;
	onPress: () => void;
}) {
	const copy = PLAN_COPY[plan];
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ selected }}
			onPress={onPress}
			style={({ pressed }) => [
				styles.planRow,
				selected && styles.planRowSelected,
				pressed && { opacity: 0.88 },
			]}
		>
			<View style={[styles.radio, selected && styles.radioSelected]}>
				{selected ? <View style={styles.radioDot} /> : null}
			</View>
			<View style={styles.planCopy}>
				<View style={styles.planTitleRow}>
					<Text style={styles.planTitle}>{copy.title}</Text>
					{copy.badge ? (
						<View style={styles.planBadge}>
							<Text style={styles.planBadgeText}>{copy.badge}</Text>
						</View>
					) : null}
				</View>
				<Text style={styles.planDetail}>{copy.detail}</Text>
			</View>
			<Text style={styles.planPrice}>{copy.price}</Text>
		</Pressable>
	);
}

function LegalAction({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Text accessibilityRole="button" onPress={onPress} style={styles.legalLink}>
			{label}
		</Text>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		width: "100%",
		justifyContent: "space-between",
		gap: spacing.xs,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
	},
	headerSide: {
		width: 40,
		height: 40,
	},
	backButton: {
		width: 40,
		height: 40,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.status.success.background,
	},
	logoWrap: {
		flex: 1,
		alignItems: "center",
		gap: 0,
		paddingTop: 2,
	},
	logo: {
		width: 178,
		height: 34,
	},
	tagline: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 15,
		lineHeight: 22,
	},
	pip: {
		marginTop: 12,
		marginBottom: -32,
	},
	trustBlock: {
		alignItems: "center",
		gap: 3,
		marginTop: -2,
	},
	trustRow: {
		flexDirection: "row",
		justifyContent: "center",
		gap: spacing.xs,
	},
	trustMetric: {
		minWidth: 104,
		minHeight: 56,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
		position: "relative",
		...tokens.shadow.card,
	},
	metricCenter: {
		alignItems: "center",
	},
	metricIconRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
	},
	metricValue: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 24,
	},
	metricLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
	},
	trustedText: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 17,
		textAlign: "center",
	},
	promiseBlock: {
		alignItems: "center",
		gap: spacing.sm,
	},
	promiseTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 25,
		lineHeight: 31,
		textAlign: "center",
	},
	trialPill: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		alignSelf: "stretch",
		minHeight: 46,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.status.success.background,
		borderWidth: 1,
		borderColor: tokens.color.border.emphasis,
	},
	trialText: {
		color: palette.primaryDark,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	planList: {
		gap: spacing.sm,
	},
	planRow: {
		minHeight: 64,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	planRowSelected: {
		borderColor: palette.primary,
		backgroundColor: tokens.color.surface.card.success,
	},
	radio: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 2,
		borderColor: tokens.color.border.strong,
		alignItems: "center",
		justifyContent: "center",
	},
	radioSelected: {
		borderColor: palette.primary,
	},
	radioDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: palette.primary,
	},
	planCopy: {
		flex: 1,
		gap: 2,
	},
	planTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	planTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	planBadge: {
		borderRadius: 999,
		backgroundColor: tokens.color.status.warning.background,
		paddingHorizontal: spacing.xs,
		paddingVertical: 3,
	},
	planBadgeText: {
		color: tokens.color.status.warning.foreground,
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 12,
	},
	planDetail: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	planPrice: {
		color: palette.primaryDark,
		fontFamily: type.body.bold,
		fontSize: 14,
		lineHeight: 18,
	},
	ctaBlock: {
		gap: spacing.sm,
	},
	legalRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	statusText: {
		color: tokens.color.status.danger.foreground,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
		textAlign: "center",
	},
	legalLink: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	legalDot: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
});

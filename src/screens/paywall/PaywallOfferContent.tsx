import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Pip } from "../../components/common/Pip";
import { HeroMetric, PrimaryButton, Wordmark } from "../../components/common/UI";
import { SubscriptionPlan } from "../../types/domain";
import { RevenueCatPlanDisplay } from "../../services/billing/revenueCatMapping";
import { palette, radii, spacing, tokens, type } from "../../theme";

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
		detail: "About $0.67/week, billed once a year",
		badge: "Best value",
	},
};

export type PaywallCaseFile = {
	startingScore: number;
	suspects: string[];
	conditionCount: number;
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
	planDisplay?: RevenueCatPlanDisplay;
	caseFile?: PaywallCaseFile | null;
	onScience?: () => void;
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
	planDisplay,
	caseFile,
	onScience,
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
				<View style={styles.brandWrap}>
					<Wordmark />
					<Text style={styles.tagline}>{"Know how you'll feel before you eat"}</Text>
				</View>
				<View style={styles.headerSide} />
			</View>

			{caseFile ? (
				<View style={styles.pictureCard}>
					<Text style={styles.pictureKicker}>Your starting picture</Text>
					<View style={styles.pictureRow}>
						<HeroMetric
							value={caseFile.startingScore}
							unit="/100"
							caption="starting Gut Score — higher means calmer"
							style={styles.pictureMetric}
						/>
						<Pip state="joy" size={72} />
					</View>
					{caseFile.suspects.length > 0 ? (
						<Text style={styles.pictureLine}>
							{"Foods we'll watch first: "}
							<Text style={styles.pictureStrong}>{caseFile.suspects.join(", ")}</Text>
						</Text>
					) : null}
					<Text style={styles.pictureMeta}>
						Built from your answers — every scan and check-in sharpens it.
					</Text>
				</View>
			) : (
				<View style={styles.trustBlock}>
					<Pip state="joy" size={84} />
					<Text style={styles.trustedText}>
						Built on published gut-trigger research, tuned to your answers.
					</Text>
				</View>
			)}

			<View style={styles.promiseBlock}>
				<Text style={styles.promiseTitle}>Start free while Pip fills in the rest</Text>
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
						display={planDisplay?.[plan]}
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
					{onScience ? (
						<>
							<LegalAction label="How it works" onPress={onScience} />
							<Text style={styles.legalDot}>•</Text>
						</>
					) : null}
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

function PlanRow({
	plan,
	display,
	selected,
	onPress,
}: {
	plan: SubscriptionPlan;
	display?: RevenueCatPlanDisplay[SubscriptionPlan];
	selected: boolean;
	onPress: () => void;
}) {
	const copy = { ...PLAN_COPY[plan], ...display };
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
	brandWrap: {
		flex: 1,
		alignItems: "center",
		gap: 2,
		paddingTop: 2,
	},
	tagline: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 13,
		lineHeight: 18,
	},
	trustBlock: {
		alignItems: "center",
		gap: spacing.xs,
	},
	// The hero: the user's personalized starting picture. The serif numeral is
	// the biggest thing on the screen — "Pip already started on you" is the
	// reason to subscribe, not an infomercial headline.
	pictureCard: {
		borderRadius: radii.lg,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		gap: spacing.xs,
		...tokens.shadow.card,
	},
	pictureKicker: {
		...tokens.type.label.eyebrow,
		color: tokens.color.text.tertiary,
		textTransform: "uppercase",
	},
	pictureRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	pictureMetric: {
		flex: 1,
	},
	pictureLine: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.primary,
	},
	pictureStrong: {
		fontFamily: type.body.bold,
		color: palette.primaryDark,
	},
	pictureMeta: {
		...tokens.type.body.small,
		color: tokens.color.text.tertiary,
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
		...tokens.type.title.card,
		color: palette.text,
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
		borderRadius: radii.md,
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
		borderRadius: radii.pill,
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
	// Price scanning is the user's second job on a paywall — the price sits at
	// plan-title weight and size, never smaller than the plan name.
	planPrice: {
		color: palette.primaryDark,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
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
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.status.danger.foreground,
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

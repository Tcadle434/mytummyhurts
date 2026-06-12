import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Pip } from "../../components/common/Pip";
import { PrimaryButton } from "../../components/common/UI";
import { SubscriptionPlan } from "../../types/domain";
import { RevenueCatPlanDisplay } from "../../services/billing/revenueCatMapping";
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
				<View style={styles.logoWrap}>
					<Image
						source={MTH_TEXT_LOGO}
						style={styles.logo}
						resizeMode="contain"
						accessibilityIgnoresInvertColors
					/>
					<Text style={styles.tagline}>{"Know how you'll feel before you eat"}</Text>
					<Pip state="joy" size={96} style={styles.pip} />
				</View>
				<View style={styles.headerSide} />
			</View>

			{caseFile ? (
				<View style={styles.caseFileCard}>
					<View style={styles.caseFileHeader}>
						<Text style={styles.caseFileKicker}>Your case file</Text>
						<View style={styles.caseScorePill}>
							<Text style={styles.caseScoreValue}>{caseFile.startingScore}</Text>
							<Text style={styles.caseScoreLabel}>starting Gut Score</Text>
						</View>
					</View>
					{caseFile.suspects.length > 0 ? (
						<View style={styles.caseFileRow}>
							<Ionicons name="search" size={14} color={palette.primaryDark} />
							<Text style={styles.caseFileLine}>
								Starting suspects: <Text style={styles.caseFileStrong}>{caseFile.suspects.join(", ")}</Text>
							</Text>
						</View>
					) : null}
					<View style={styles.caseFileRow}>
						<Ionicons name="git-branch-outline" size={14} color={palette.primaryDark} />
						<Text style={styles.caseFileLine}>
							Your scans and daily check-ins confirm or clear each one over time.
						</Text>
					</View>
				</View>
			) : (
				<View style={styles.trustBlock}>
					<Text style={styles.trustedText}>
						Built on published gut-trigger research, tuned to your answers.
					</Text>
				</View>
			)}

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
	caseFileCard: {
		borderRadius: 20,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		gap: spacing.xs,
		...tokens.shadow.card,
	},
	caseFileHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	caseFileKicker: {
		color: palette.textMuted,
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
		textTransform: "uppercase",
		letterSpacing: 0.6,
	},
	caseScorePill: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: 999,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: 3,
	},
	caseScoreValue: {
		color: palette.primaryDark,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	caseScoreLabel: {
		color: palette.primaryDark,
		fontFamily: type.body.medium,
		fontSize: 11,
		lineHeight: 14,
	},
	caseFileRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
	},
	caseFileLine: {
		flex: 1,
		color: palette.text,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
	caseFileStrong: {
		fontFamily: type.body.bold,
		color: palette.primaryDark,
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

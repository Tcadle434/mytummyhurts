import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type RiskEvidenceTone = "low" | "medium" | "high";

const PHASE_2_ILLUSTRATION = require("../../../../assets/ui/phase_2_illustration.png");

/**
 * Phase 2 and Phase 3 share the same plan-card system: a compact phase header,
 * evidence rows, and a single outcome callout. Keeping them together avoids the
 * onboarding flow owning repeated card scaffolding.
 */
export function PhaseLimitationGraphic() {
	return (
		<View style={styles.card}>
			<View style={styles.header}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>2</Text>
				</View>
				<View style={styles.headerCopy}>
					<Text style={styles.eyebrow}>Limitation</Text>
					<Text style={styles.title}>Risk scores become a plan</Text>
				</View>
				<Image
					source={PHASE_2_ILLUSTRATION}
					style={styles.phaseLimitationIllustration}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			</View>

			<View style={styles.panel}>
				<View style={styles.panelHeader}>
					<Text style={styles.panelTitle}>Likely triggers</Text>
					<View style={styles.limitPlanBadge}>
						<Ionicons
							name="remove-circle-outline"
							size={15}
							color={tokens.color.status.risk.medium.foreground}
						/>
						<Text style={styles.limitPlanBadgeText}>Limit</Text>
					</View>
				</View>

				<View style={styles.evidenceStack}>
					<IngredientEvidenceRow
						ingredient="Tomato"
						evidence="Appears often on reflux days"
						pillLabel="High risk"
						tone="high"
						iconName="alert-circle-outline"
					/>
					<IngredientEvidenceRow
						ingredient="Garlic"
						evidence="Shows up on reactive reports"
						pillLabel="Watch closely"
						tone="medium"
						iconName="eye-outline"
					/>
					<IngredientEvidenceRow
						ingredient="Cream"
						evidence="Needs more data"
						pillLabel="Possible"
						tone="medium"
						iconName="flask-outline"
					/>
				</View>

				<View style={styles.callout}>
					<View style={styles.calloutIcon}>
						<Ionicons
							name="trending-up"
							size={17}
							color={tokens.color.status.risk.low.foreground}
						/>
					</View>
					<Text style={styles.calloutText}>
						Limit likely triggers and watch your Gut Score rise.
					</Text>
				</View>
			</View>
		</View>
	);
}

export function PhaseReintroductionGraphic() {
	return (
		<View style={styles.card}>
			<View style={styles.header}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>3</Text>
				</View>
				<View style={styles.headerCopy}>
					<Text style={styles.eyebrow}>Reintroduction</Text>
					<Text style={styles.title}>Earn foods back carefully</Text>
				</View>
				<View style={styles.reintroductionHeroIcon}>
					<Ionicons
						name="leaf-outline"
						size={34}
						color={tokens.color.status.risk.low.foreground}
					/>
				</View>
			</View>

			<View style={styles.panel}>
				<View style={styles.panelHeader}>
					<Text style={styles.panelTitle}>Guided tests</Text>
					<View style={styles.reintroductionPlanBadge}>
						<Ionicons
							name="lock-open-outline"
							size={15}
							color={tokens.color.status.risk.low.foreground}
						/>
						<Text style={styles.reintroductionPlanBadgeText}>Unlocked</Text>
					</View>
				</View>

				<View style={styles.evidenceStack}>
					<PhasePlanRow
						title="Test one food"
						body="Small serving, clear baseline"
						pillLabel="Careful"
						tone="medium"
						iconName="flask-outline"
					/>
					<PhasePlanRow
						title="Learn tolerance"
						body="Scans and reports update future risk"
						pillLabel="Adaptive"
						tone="low"
						iconName="sync-outline"
					/>
				</View>

				<View style={styles.callout}>
					<View style={styles.calloutIcon}>
						<Ionicons
							name="heart-outline"
							size={17}
							color={tokens.color.status.risk.low.foreground}
						/>
					</View>
					<Text style={styles.calloutText}>Eat more of what you love with confidence.</Text>
				</View>
			</View>
		</View>
	);
}

function IngredientEvidenceRow({
	ingredient,
	evidence,
	pillLabel,
	tone,
	iconName,
}: {
	ingredient: string;
	evidence: string;
	pillLabel: string;
	tone: RiskEvidenceTone;
	iconName: IoniconName;
}) {
	return (
		<PhasePlanRow
			title={ingredient}
			body={evidence}
			pillLabel={pillLabel}
			tone={tone}
			iconName={iconName}
		/>
	);
}

function PhasePlanRow({
	title,
	body,
	pillLabel,
	tone,
	iconName,
}: {
	title: string;
	body: string;
	pillLabel: string;
	tone: RiskEvidenceTone;
	iconName: IoniconName;
}) {
	const toneColors = riskEvidenceColors(tone);

	return (
		<View style={styles.evidenceRow}>
			<View style={[styles.evidenceIcon, { backgroundColor: toneColors.background }]}>
				<Ionicons name={iconName} size={18} color={toneColors.foreground} />
			</View>
			<View style={styles.evidenceCopy}>
				<Text style={styles.evidenceTitle}>{title}</Text>
				<Text style={styles.evidenceBody}>{body}</Text>
			</View>
			<View style={[styles.riskEvidencePill, { backgroundColor: toneColors.background }]}>
				<Text style={[styles.riskEvidencePillText, { color: toneColors.foreground }]}>
					{pillLabel}
				</Text>
			</View>
		</View>
	);
}

function riskEvidenceColors(tone: RiskEvidenceTone) {
	if (tone === "high") return tokens.color.status.risk.high;
	if (tone === "medium") return tokens.color.status.risk.medium;
	return tokens.color.status.risk.low;
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	phaseNumberBadge: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: palette.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	phaseNumber: {
		color: tokens.color.text.inverse,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 26,
	},
	headerCopy: {
		flex: 1,
		gap: 2,
	},
	eyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 25,
	},
	phaseLimitationIllustration: {
		width: 92,
		height: 72,
		marginLeft: "auto",
	},
	panel: {
		width: "100%",
		minHeight: 268,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	panelHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	panelTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	limitPlanBadge: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.risk.medium.background,
		paddingHorizontal: spacing.sm,
	},
	limitPlanBadgeText: {
		color: tokens.color.status.risk.medium.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	evidenceStack: {
		gap: spacing.xs,
	},
	evidenceRow: {
		minHeight: 61,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	evidenceIcon: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	evidenceCopy: {
		flex: 1,
		gap: 2,
	},
	evidenceTitle: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 19,
	},
	evidenceBody: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	riskEvidencePill: {
		minHeight: 25,
		justifyContent: "center",
		borderRadius: 99,
		paddingHorizontal: spacing.sm,
	},
	riskEvidencePillText: {
		fontFamily: type.body.bold,
		fontSize: 11,
		lineHeight: 14,
	},
	callout: {
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 16,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	calloutIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	calloutText: {
		flex: 1,
		color: tokens.color.text.accent,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	reintroductionHeroIcon: {
		width: 68,
		height: 68,
		borderRadius: 24,
		backgroundColor: tokens.color.status.success.background,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: "auto",
	},
	reintroductionPlanBadge: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
	},
	reintroductionPlanBadgeText: {
		color: tokens.color.status.risk.low.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
});

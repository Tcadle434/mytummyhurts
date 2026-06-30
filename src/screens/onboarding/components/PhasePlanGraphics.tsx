import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, tokens, type } from "../../../theme";
import { riskLevelColors } from "../../../utils/risk";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type RiskEvidenceTone = "low" | "medium" | "high";
type CalloutTone = "warm" | "sage";

type PhasePlanRowProps = {
	title: string;
	body: string;
	pillLabel: string;
	tone: RiskEvidenceTone;
	iconName: IoniconName;
};

/**
 * Phase 2 and Phase 3 share the same plan-card system: a clean phase header,
 * a tinted list group, and a single outcome callout. Keeping them together
 * avoids duplicating row/callout scaffolding between phases.
 */
export function PhaseLimitationGraphic() {
	const rows: PhasePlanRowProps[] = [
		{
			title: "Tomato",
			body: "Appears often on reflux days",
			pillLabel: "Avoid",
			tone: "high",
			iconName: "alert-circle",
		},
		{
			title: "Garlic",
			body: "Shows up on reactive reports",
			pillLabel: "Limit",
			tone: "medium",
			iconName: "eye-outline",
		},
		{
			title: "Cream",
			body: "Needs more data",
			pillLabel: "Eat in moderation",
			tone: "medium",
			iconName: "help-circle-outline",
		},
	];

	return (
		<PhaseCard
			number="2"
			eyebrow="Limitation"
			title="Risk scores become a plan"
			listLabel="Likely triggers"
			rows={rows}
			callout={{
				iconName: "trending-up",
				label: "Limit likely triggers and watch your Gut Score rise.",
				tone: "warm",
			}}
		/>
	);
}

export function PhaseReintroductionGraphic() {
	const rows: PhasePlanRowProps[] = [
		{
			title: "Test one food",
			body: "Small serving, clear baseline",
			pillLabel: "Careful",
			tone: "medium",
			iconName: "flask-outline",
		},
		{
			title: "Learn tolerance",
			body: "Scans and reports update future risk",
			pillLabel: "Adaptive",
			tone: "low",
			iconName: "sync-outline",
		},
	];

	return (
		<PhaseCard
			number="3"
			eyebrow="Reintroduction"
			title="Earn foods back carefully"
			listLabel="Guided tests"
			listBadge={{
				iconName: "sparkles-outline",
				label: "Unlocked",
				tone: "low",
			}}
			rows={rows}
			callout={{
				iconName: "heart-outline",
				label: "Eat more of what you love with confidence.",
				tone: "sage",
			}}
		/>
	);
}

type PhaseCardProps = {
	number: string;
	eyebrow: string;
	title: string;
	listLabel: string;
	listBadge?: { iconName: IoniconName; label: string; tone: RiskEvidenceTone };
	rows: PhasePlanRowProps[];
	callout: { iconName: IoniconName; label: string; tone: CalloutTone };
};

function PhaseCard({
	number,
	eyebrow,
	title,
	listLabel,
	listBadge,
	rows,
	callout,
}: PhaseCardProps) {
	return (
		<View style={styles.card}>
			<View style={styles.header}>
				<View style={styles.phaseNumberBadge}>
					<Text style={styles.phaseNumber}>{number}</Text>
				</View>
				<View style={styles.headerCopy}>
					<Text style={styles.eyebrow}>{eyebrow}</Text>
					<Text style={styles.title}>{title}</Text>
				</View>
			</View>

			<View style={styles.listHeader}>
				<Text style={styles.listLabel}>{listLabel}</Text>
				{listBadge ? (
					<TonedBadge
						iconName={listBadge.iconName}
						label={listBadge.label}
						tone={listBadge.tone}
					/>
				) : null}
			</View>

			<View style={styles.listGroup}>
				{rows.map((row, index) => (
					<Fragment key={row.title}>
						{index > 0 ? <View style={styles.listDivider} /> : null}
						<PhasePlanRow {...row} />
					</Fragment>
				))}
			</View>

			<PhaseCallout
				iconName={callout.iconName}
				label={callout.label}
				tone={callout.tone}
			/>
		</View>
	);
}

function PhasePlanRow({ title, body, pillLabel, tone, iconName }: PhasePlanRowProps) {
	const toneColors = riskLevelColors(tone);

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

function TonedBadge({
	iconName,
	label,
	tone,
}: {
	iconName: IoniconName;
	label: string;
	tone: RiskEvidenceTone;
}) {
	const toneColors = riskLevelColors(tone);

	return (
		<View style={[styles.tonedBadge, { backgroundColor: toneColors.background }]}>
			<Ionicons name={iconName} size={15} color={toneColors.foreground} />
			<Text style={[styles.tonedBadgeText, { color: toneColors.foreground }]}>{label}</Text>
		</View>
	);
}

function PhaseCallout({
	iconName,
	label,
	tone,
}: {
	iconName: IoniconName;
	label: string;
	tone: CalloutTone;
}) {
	const { background, foreground } = calloutColors(tone);

	return (
		<View style={[styles.callout, { backgroundColor: background }]}>
			<View style={styles.calloutIcon}>
				<Ionicons name={iconName} size={17} color={foreground} />
			</View>
			<Text style={[styles.calloutText, { color: foreground }]}>{label}</Text>
		</View>
	);
}

function calloutColors(tone: CalloutTone) {
	if (tone === "warm") {
		return {
			background: tokens.color.status.risk.medium.background,
			foreground: tokens.color.status.risk.medium.foreground,
		};
	}

	return {
		background: tokens.color.status.success.background,
		foreground: tokens.color.text.accent,
	};
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		maxWidth: 360,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.lg,
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
	listHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	listLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 17,
		lineHeight: 22,
	},
	tonedBadge: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 99,
		paddingHorizontal: spacing.sm,
	},
	tonedBadgeText: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	listGroup: {
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	listDivider: {
		height: 1,
		backgroundColor: tokens.color.border.subtle,
		marginHorizontal: spacing.xs,
	},
	evidenceRow: {
		minHeight: 60,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
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
		borderRadius: 18,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	calloutIcon: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: tokens.color.surface.card.default,
		alignItems: "center",
		justifyContent: "center",
	},
	calloutText: {
		flex: 1,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
});

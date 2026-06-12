import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colorForLevel, isPersonalContributor, prioritizeScoreContributors, type RiskLevel } from "./common";
import { palette, spacing, tokens, type } from "../../theme";
import type { ScoreContributor } from "../../types/domain";

export function ScoreDriversList({
	contributors,
	accentColor,
	title = "Score drivers",
	compact = false,
}: {
	contributors: ScoreContributor[];
	accentColor: string;
	title?: string | null;
	compact?: boolean;
}) {
	if (!contributors.length) {
		return null;
	}

	if (compact) {
		// Weight hierarchy via the app's existing meter idiom: a thin tinted
		// track under each driver, filled by its share of the largest one.
		// Thin bars make 100% vs 70% legible; background floods don't.
		const maxMagnitude = Math.max(...contributors.map((driver) => Math.abs(driver.points)), 1);
		return (
			<View style={styles.driverList}>
				{title ? <Text style={styles.insightLabel}>{title}</Text> : null}
				{contributors.map((driver) => {
					const magnitude = Math.abs(driver.points);
					const tone =
						driver.points < 0
							? tokens.color.status.risk.low
							: magnitude >= 15
								? tokens.color.status.risk.high
								: magnitude >= 8
									? tokens.color.status.risk.medium
									: tokens.color.status.risk.low;
					const fillPercent = Math.max(6, Math.round((magnitude / maxMagnitude) * 100));
					const pointsLabel = `${driver.points > 0 ? "+" : ""}${driver.points}`;
					return (
						<View key={`${driver.key}-${driver.source}`} style={styles.driverRow}>
							<View style={styles.scoreDriverLabelRow}>
								<View style={[styles.driverPointsCircle, { borderColor: tone.tint }]}>
									<Text style={[styles.driverPoints, { color: tone.tint }]}>{pointsLabel}</Text>
								</View>
								<Text style={styles.scoreDriverLabel} numberOfLines={1}>
									{driver.label}
								</Text>
								{isPersonalContributor(driver) ? (
									<View style={styles.profileChip}>
										<Ionicons name="person" size={9} color={palette.primary} />
										<Text style={styles.profileChipText}>
											{driver.evidence === "learning" ? "Learned" : "Your profile"}
										</Text>
									</View>
								) : null}
							</View>
							{driver.source ? (
								<Text style={styles.driverSource} numberOfLines={1}>
									{driver.source}
								</Text>
							) : null}
							<View style={styles.driverTrack}>
								<View
									style={[
										styles.driverTrackFill,
										{ width: `${fillPercent}%`, backgroundColor: tone.tint },
									]}
								/>
							</View>
						</View>
					);
				})}
			</View>
		);
	}

	return (
		<View style={styles.scoreDrivers}>
			{title ? <Text style={styles.insightLabel}>{title}</Text> : null}
			{contributors.map((driver) => {
				const driverColor = driver.points >= 0 ? accentColor : palette.primary;
				const pointsLabel = `${driver.points > 0 ? "+" : ""}${driver.points}`;
				return (
					<View key={`${driver.key}-${driver.source}`} style={styles.scoreDriverRow}>
						<Text style={[styles.scoreDriverPoints, { color: driverColor }]}>{pointsLabel}</Text>
						<View style={styles.scoreDriverBody}>
							<View style={styles.scoreDriverLabelRow}>
								<Text style={styles.scoreDriverLabel}>{driver.label}</Text>
								{isPersonalContributor(driver) ? (
									<View style={styles.profileChip}>
										<Ionicons name="person" size={9} color={palette.primary} />
										<Text style={styles.profileChipText}>
											{driver.evidence === "learning" ? "Learned" : "Your profile"}
										</Text>
									</View>
								) : null}
							</View>
							<Text style={styles.scoreDriverReason}>{driver.reason}</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

export function WhyThisScoreCard({
	contributors,
	level,
	impactSummary,
}: {
	contributors?: ScoreContributor[];
	level: RiskLevel;
	impactSummary?: string;
}) {
	const prioritized = prioritizeScoreContributors(contributors, 4);
	if (!prioritized.length) {
		return null;
	}

	const personalLabels = prioritized
		.filter(isPersonalContributor)
		.map((contributor) => contributor.label.toLowerCase());
	const accentColor = colorForLevel(level);

	return (
		<View style={styles.resultCard}>
			<Text style={styles.cardTitle}>Why this score for you</Text>
			{personalLabels.length > 0 ? (
				<View style={styles.receiptRow}>
					<Ionicons name="sparkles" size={14} color={palette.primary} />
					<Text style={styles.receiptText}>
						Because you told us: {personalLabels.join(", ")}
					</Text>
				</View>
			) : null}
			<ScoreDriversList contributors={prioritized} accentColor={accentColor} title={null} compact />
			{impactSummary ? <Text style={styles.scoreDriverReason}>{impactSummary}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	driverList: {
		gap: spacing.md,
	},
	insightLabel: {
		color: palette.textMuted,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	driverRow: {
		gap: 5,
	},
	scoreDriverLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		flexWrap: "wrap",
	},
	driverPointsCircle: {
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 1.5,
		alignItems: "center",
		justifyContent: "center",
	},
	driverPoints: {
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	scoreDriverLabel: {
		color: palette.text,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	profileChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: spacing.xs,
		paddingVertical: 1,
		borderRadius: 999,
		backgroundColor: palette.sageSoft,
	},
	profileChipText: {
		color: palette.primary,
		fontFamily: type.body.semibold,
		fontSize: 10,
		lineHeight: 14,
	},
	driverSource: {
		marginLeft: 44,
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
	driverTrack: {
		marginLeft: 44,
		height: 4,
		borderRadius: 2,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	driverTrackFill: {
		height: "100%",
		borderRadius: 2,
	},
	scoreDrivers: {
		gap: spacing.xs,
	},
	scoreDriverRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		borderRadius: 14,
		backgroundColor: tokens.color.surface.card.warm,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	scoreDriverPoints: {
		minWidth: 34,
		fontFamily: type.body.bold,
		fontSize: 13,
		lineHeight: 18,
	},
	scoreDriverBody: {
		flex: 1,
		gap: 1,
	},
	scoreDriverReason: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
	resultCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		padding: spacing.lg,
		gap: spacing.md,
		...tokens.shadow.card,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 18,
		lineHeight: 23,
	},
	receiptRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
		borderRadius: 12,
		backgroundColor: palette.sageSoft,
	},
	receiptText: {
		flex: 1,
		color: palette.primaryDark,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 17,
	},
});

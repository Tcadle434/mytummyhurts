import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colorForLevel, isPersonalContributor, prioritizeScoreContributors, type RiskLevel } from "./common";
import { cardTitleStyle, resultCardStyle, sectionLabelStyle } from "./styles";
import { palette, spacing, tokens, type } from "../../theme";
import type { ScoreContributor } from "../../types/domain";

// We show a qualitative tier instead of raw points. The internal score is an
// LLM-anchored, multi-factor number that does NOT equal the sum of these
// drivers, so printing "+15 / -7" reads as math that doesn't add up. A tier
// (Major / Moderate / Minor / Eases) communicates each driver's weight and
// direction without implying an arithmetic that isn't there.
function driverTier(points: number): { label: string; tone: { tint: string; foreground: string } } {
	if (points < 0) {
		return { label: "Eases", tone: tokens.color.status.risk.low };
	}
	const magnitude = Math.abs(points);
	if (magnitude >= 15) {
		return { label: "Major", tone: tokens.color.status.risk.high };
	}
	if (magnitude >= 8) {
		return { label: "Moderate", tone: tokens.color.status.risk.medium };
	}
	return { label: "Minor", tone: tokens.color.status.risk.low };
}

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
		// track under each driver, filled by its share of the largest one. The
		// tier word on the right names the direction/strength; the bar shows
		// relative weight. No raw point numbers.
		const maxMagnitude = Math.max(...contributors.map((driver) => Math.abs(driver.points)), 1);
		return (
			<View style={styles.driverList}>
				{title ? <Text style={sectionLabelStyle}>{title}</Text> : null}
				{contributors.map((driver) => {
					const magnitude = Math.abs(driver.points);
					const { label: tierLabel, tone } = driverTier(driver.points);
					const fillPercent = Math.max(6, Math.round((magnitude / maxMagnitude) * 100));
					return (
						<View key={`${driver.key}-${driver.source}`} style={styles.driverRow}>
							<View style={styles.scoreDriverLabelRow}>
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
								{/* Tier word is text — text-grade foreground, never the tint. */}
								<Text style={[styles.driverTier, { color: tone.foreground }]}>{tierLabel}</Text>
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
			{title ? <Text style={sectionLabelStyle}>{title}</Text> : null}
			{contributors.map((driver) => {
				const { label: tierLabel, tone } = driverTier(driver.points);
				return (
					<View key={`${driver.key}-${driver.source}`} style={styles.scoreDriverRow}>
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
								<Text style={[styles.driverTier, { color: tone.foreground }]}>{tierLabel}</Text>
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
		<View style={resultCardStyle}>
			<Text style={cardTitleStyle}>Why this score for you</Text>
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
	driverRow: {
		gap: 5,
	},
	scoreDriverLabelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	driverTier: {
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	scoreDriverLabel: {
		flex: 1,
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
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 12,
		lineHeight: 16,
	},
	driverTrack: {
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

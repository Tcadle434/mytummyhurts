import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { bandForeground, bandRiskColors } from "./bandStyle";
import { DailyScoreRing as SharedDailyScoreRing } from "./DailyScoreRing";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	DailyScoreBand,
	WeeklyProgressDay,
	dailyScoreBand,
	formatMonthDay,
	getFeaturedDailyScoreDay,
	parseLocalDate,
} from "../../utils/weeklyProgress";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type WeeklyProgressCardProps = {
	days: WeeklyProgressDay[];
	mode?: "preview" | "interactive";
	title?: string;
	subtitle?: string;
	onPress?: () => void;
	showChevron?: boolean;
	featuredDay?: WeeklyProgressDay;
	featuredLocalDate?: string;
	featuredLabel?: string;
	onFeaturedMealsPress?: (day: WeeklyProgressDay) => void;
	onFeaturedSymptomsPress?: (day: WeeklyProgressDay) => void;
	style?: StyleProp<ViewStyle>;
};

export function WeeklyProgressCard({
	days,
	mode = "interactive",
	title = "Daily Score",
	subtitle,
	onPress,
	showChevron = mode === "interactive",
	featuredDay,
	featuredLocalDate,
	featuredLabel,
	onFeaturedMealsPress,
	onFeaturedSymptomsPress,
	style,
}: WeeklyProgressCardProps) {
	const resolvedFeaturedDay = featuredDay ?? getFeaturedDailyScoreDay(days, featuredLocalDate);
	const content = (
		<View style={[styles.card, style]}>
			<View style={styles.headerRow}>
				<View style={styles.titleStack}>
					<Text style={styles.title}>{title}</Text>
					{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
				</View>
				<View style={styles.headerRight}>
					{showChevron ? (
						<Ionicons
							name="chevron-forward"
							size={19}
							color={tokens.color.icon.muted}
						/>
					) : null}
				</View>
			</View>

			{resolvedFeaturedDay ? (
				<FeaturedDailyScore
					day={resolvedFeaturedDay}
					label={featuredLabel}
					onMealsPress={
						mode === "interactive" && onFeaturedMealsPress
							? () => onFeaturedMealsPress(resolvedFeaturedDay)
							: undefined
					}
					onSymptomsPress={
						mode === "interactive" && onFeaturedSymptomsPress
							? () => onFeaturedSymptomsPress(resolvedFeaturedDay)
							: undefined
					}
				/>
			) : null}

			<View style={styles.daysRow}>
				{days.map((day) => (
					<WeeklyProgressColumn key={day.localDate} day={day} />
				))}
			</View>

			<BandSummaryLine days={days} />
		</View>
	);

	if (mode !== "interactive" || !onPress) {
		return content;
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Open weekly Daily Score progress"
			onPress={onPress}
			style={({ pressed }) => [pressed && { opacity: 0.92 }]}
		>
			{content}
		</Pressable>
	);
}

function FeaturedDailyScore({
	day,
	label = "Yesterday",
	onMealsPress,
	onSymptomsPress,
}: {
	day: WeeklyProgressDay;
	label?: string;
	onMealsPress?: () => void;
	onSymptomsPress?: () => void;
}) {
	const hasScore = day.hasReport && day.dailyScore !== undefined;
	const score = hasScore ? day.dailyScore : undefined;
	const mealLine = `${day.mealCount} meal${day.mealCount === 1 ? "" : "s"} logged`;
	// Honest uncertainty: a missing check-in is said out loud, never read as
	// "no symptoms".
	const symptomLine = day.report
		? `${symptomSeverityLabel(day.report.gutSeverity)} symptoms reported`
		: "no check-in yet";
	const symptomTone = day.report
		? symptomSeverityForeground(day.report.gutSeverity)
		: undefined;

	return (
		<View style={styles.featuredWrap}>
			<DailyScoreRing score={score} />
			<View style={styles.featuredCopy}>
				<View style={styles.featuredEyebrowRow}>
					<Text style={styles.featuredEyebrow}>{label.toUpperCase()}</Text>
					<View style={styles.featuredSeparatorDot} />
					<Text style={styles.featuredDate}>{formatMonthDay(day.localDate)}</Text>
				</View>
				<View style={styles.featuredDetailStack}>
					<FeaturedDetailLine
						iconName="restaurant-outline"
						text={mealLine}
						onPress={onMealsPress}
					/>
					<FeaturedDetailLine
						iconName="pulse-outline"
						text={symptomLine}
						tone={symptomTone}
						onPress={onSymptomsPress}
					/>
				</View>
			</View>
		</View>
	);
}

function FeaturedDetailLine({
	iconName,
	text,
	onPress,
	tone,
}: {
	iconName: IoniconName;
	text: string;
	onPress?: () => void;
	tone?: string;
}) {
	const iconColor = tone ?? tokens.color.icon.accent;
	const content = (
		<>
			<Ionicons name={iconName} size={14} color={iconColor} />
			<Text
				style={[
					styles.featuredDetailText,
					onPress && styles.featuredDetailTextLink,
					tone ? { color: tone } : null,
				]}
			>
				{text}
			</Text>
		</>
	);

	if (!onPress) {
		return <View style={styles.featuredDetailLine}>{content}</View>;
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={text}
			hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
			onPress={(event) => {
				event.stopPropagation();
				onPress();
			}}
			style={({ pressed }) => [styles.featuredDetailLine, pressed && { opacity: 0.72 }]}
		>
			{content}
			<Ionicons name="chevron-forward" size={12} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

function DailyScoreRing({ score }: { score?: number }) {
	return <SharedDailyScoreRing score={score} size={92} />;
}

/**
 * One day of the seven-day strip: a full weekday abbreviation over a
 * band-toned score chip. The chip carries number + color; the summary line
 * below the strip carries the band words — no legend required.
 */
function WeeklyProgressColumn({ day }: { day: WeeklyProgressDay }) {
	const hasScore = day.dailyScore !== undefined && day.hasReport;
	const score = hasScore ? (day.dailyScore as number) : undefined;
	const colors = score !== undefined ? bandRiskColors(score) : undefined;

	return (
		<View
			style={styles.dayColumn}
			accessible
			accessibilityLabel={columnAccessibilityLabel(day, score)}
		>
			<Text style={styles.weekday}>{shortWeekday(day.localDate)}</Text>
			<View
				style={[
					styles.scoreChip,
					colors
						? { backgroundColor: colors.background }
						: styles.scoreChipEmpty,
				]}
			>
				<Text
					style={[
						styles.scoreChipText,
						{ color: colors ? colors.foreground : tokens.color.text.tertiary },
					]}
				>
					{score !== undefined ? `${score}%` : "—"}
				</Text>
			</View>
		</View>
	);
}

/**
 * The strip's meaning, spoken: band-word counts in the matching text-grade
 * colors ("4 calm · 1 mixed · 1 rough"). Replaces the old decoder legend.
 */
function BandSummaryLine({ days }: { days: WeeklyProgressDay[] }) {
	const scored = days.filter((day) => day.hasReport && day.dailyScore !== undefined);

	if (scored.length === 0) {
		return <Text style={styles.summaryEmpty}>No check-ins yet this week.</Text>;
	}

	const counts = scored.reduce<Record<DailyScoreBand, number>>(
		(current, day) => {
			const band = dailyScoreBand(day.dailyScore as number);
			return { ...current, [band]: current[band] + 1 };
		},
		{ calm: 0, mixed: 0, rough: 0 }
	);
	const bands: DailyScoreBand[] = ["calm", "mixed", "rough"];
	const segments = bands.filter((band) => counts[band] > 0);

	return (
		<View style={styles.summaryRow}>
			{segments.map((band, index) => (
				<View key={band} style={styles.summaryItem}>
					{index > 0 ? <Text style={styles.summarySeparator}>·</Text> : null}
					<Text style={[styles.summaryLabel, { color: bandForeground(band) }]}>
						{counts[band]} {band}
					</Text>
				</View>
			))}
			<Text style={styles.summarySuffix}>
				{scored.length === 1 ? "day so far" : "days so far"}
			</Text>
		</View>
	);
}

function columnAccessibilityLabel(day: WeeklyProgressDay, score: number | undefined) {
	const weekday = parseLocalDate(day.localDate).toLocaleDateString(undefined, {
		weekday: "long",
	});
	if (score === undefined) {
		return `${weekday}: no check-in yet`;
	}
	return `${weekday}: Daily Score ${score} percent, ${dailyScoreBand(score)} day`;
}

function shortWeekday(localDate: string) {
	return parseLocalDate(localDate).toLocaleDateString(undefined, { weekday: "short" });
}

function symptomSeverityLabel(gutSeverity: number | undefined) {
	if (gutSeverity === undefined || gutSeverity <= 0) return "no";
	if (gutSeverity <= 3) return "mild";
	if (gutSeverity <= 6) return "medium";
	return "severe";
}

// Text-grade severity color: always the darker `foreground` tone — tints are
// fills, not text.
function symptomSeverityForeground(gutSeverity: number | undefined) {
	if (gutSeverity === undefined || gutSeverity <= 3) {
		return tokens.color.status.risk.low.foreground;
	}
	if (gutSeverity <= 6) {
		return tokens.color.status.risk.medium.foreground;
	}
	return tokens.color.status.risk.high.foreground;
}

const styles = StyleSheet.create({
	card: {
		...components.card.default,
		width: "100%",
		gap: spacing.md,
		padding: spacing.lg,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	titleStack: {
		flex: 1,
		gap: 2,
	},
	title: {
		...tokens.type.title.block,
		color: tokens.color.text.primary,
	},
	subtitle: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.secondary,
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		minHeight: 22,
	},
	featuredWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	featuredCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	featuredEyebrowRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	featuredEyebrow: {
		...tokens.type.label.eyebrow,
		fontFamily: type.body.semibold,
		color: tokens.color.text.tertiary,
		letterSpacing: 0.6,
		textTransform: "uppercase",
	},
	featuredSeparatorDot: {
		width: 3,
		height: 3,
		borderRadius: 1.5,
		backgroundColor: tokens.color.text.tertiary,
		opacity: 0.7,
	},
	featuredDate: {
		...tokens.type.label.eyebrow,
		fontFamily: type.body.semibold,
		color: tokens.color.text.secondary,
	},
	featuredDetailStack: {
		gap: spacing.xs,
	},
	featuredDetailLine: {
		minHeight: 28,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	featuredDetailText: {
		...tokens.type.body.small,
		flex: 1,
		fontFamily: type.body.semibold,
		color: tokens.color.text.secondary,
	},
	featuredDetailTextLink: {
		color: tokens.color.text.accent,
	},
	daysRow: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	dayColumn: {
		flex: 1,
		alignItems: "center",
		gap: spacing.xs,
	},
	weekday: {
		...tokens.type.label.tab,
		color: tokens.color.text.tertiary,
	},
	scoreChip: {
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "center",
		minHeight: 26,
		borderRadius: radii.sm,
		paddingHorizontal: 2,
		paddingVertical: 4,
	},
	scoreChipEmpty: {
		backgroundColor: tokens.color.surface.card.warm,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
	},
	scoreChipText: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
		fontVariant: ["tabular-nums"],
	},
	summaryRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: spacing.xs,
	},
	summaryItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	summarySeparator: {
		...tokens.type.body.small,
		color: tokens.color.text.tertiary,
	},
	summaryLabel: {
		...tokens.type.body.small,
		fontFamily: type.body.semibold,
	},
	summarySuffix: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.tertiary,
	},
	summaryEmpty: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.tertiary,
	},
});

import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { DailyScoreRing as SharedDailyScoreRing } from "./DailyScoreRing";
import { components, radii, spacing, tokens, type } from "../../theme";
import {
	WeeklyProgressDay,
	WeeklyProgressTrendDirection,
	formatMonthDay,
	getFeaturedDailyScoreDay,
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

			<View style={styles.legendRow}>
				<LegendItem iconName="restaurant-outline" label="Meal logged" />
				<LegendItem type="dot" label="Score Range" />
				<LegendItem iconName="trending-up" label="Score trend" />
			</View>
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
	const symptomLine = `${symptomSeverityLabel(day.report?.gutSeverity)} symptoms reported`;

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
						tone={symptomSeverityTone(day.report?.gutSeverity)}
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

function WeeklyProgressColumn({ day }: { day: WeeklyProgressDay }) {
	const hasScore = day.dailyScore !== undefined && day.hasReport;
	const scoreColor = hasScore ? scoreTint(day.dailyScore as number) : tokens.color.chart.track;
	const trend = dayTrend(day.trendDirection);

	return (
		<View style={styles.dayColumn}>
			<Text style={styles.weekday}>{day.weekdayLabel}</Text>
			<View
				style={[
					styles.mealIconWrap,
					day.mealCount > 0 ? styles.mealIconWrapFilled : styles.mealIconWrapEmpty,
				]}
			>
				<Ionicons
					name="restaurant-outline"
					size={14}
					color={day.mealCount > 0 ? tokens.color.icon.accent : tokens.color.icon.muted}
				/>
			</View>
			<View
				style={[
					styles.scoreDot,
					hasScore
						? { backgroundColor: scoreColor, borderColor: scoreColor }
						: { backgroundColor: "transparent", borderColor: tokens.color.chart.track },
				]}
			/>
			<View style={styles.scoreRow}>
				<Text style={styles.dayScore}>{hasScore ? day.dailyScore : "—"}</Text>
				{hasScore && trend.iconName ? (
					<Ionicons name={trend.iconName} size={12} color={trend.color} />
				) : null}
			</View>
		</View>
	);
}

function LegendItem({
	iconName,
	label,
	type: itemType,
}: {
	iconName?: IoniconName;
	label: string;
	type?: "dot";
}) {
	return (
		<View style={styles.legendItem}>
			{itemType === "dot" ? (
				<View style={styles.legendDot} />
			) : (
				<Ionicons
					name={iconName ?? "ellipse-outline"}
					size={13}
					color={tokens.color.icon.muted}
				/>
			)}
			<Text style={styles.legendLabel}>{label}</Text>
		</View>
	);
}

function dayTrend(direction: WeeklyProgressTrendDirection): {
	iconName?: IoniconName;
	color: string;
} {
	if (direction === "up") {
		return { iconName: "arrow-up-outline", color: tokens.color.status.risk.low.foreground };
	}

	if (direction === "down") {
		return { iconName: "arrow-down-outline", color: tokens.color.status.risk.high.foreground };
	}

	if (direction === "flat") {
		return { iconName: "remove-outline", color: tokens.color.text.tertiary };
	}

	return { color: tokens.color.text.tertiary };
}

function symptomSeverityLabel(gutSeverity: number | undefined) {
	if (gutSeverity === undefined || gutSeverity <= 0) return "no";
	if (gutSeverity <= 3) return "mild";
	if (gutSeverity <= 6) return "medium";
	return "severe";
}

function symptomSeverityTone(gutSeverity: number | undefined) {
	if (gutSeverity === undefined || gutSeverity <= 3) {
		return tokens.color.status.risk.low.tint;
	}
	if (gutSeverity <= 6) {
		return tokens.color.status.risk.medium.tint;
	}
	return tokens.color.status.risk.high.tint;
}

function scoreTint(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.tint;
	if (score >= 34) return tokens.color.status.risk.medium.tint;
	return tokens.color.status.risk.high.tint;
}

const styles = StyleSheet.create({
	card: {
		...components.card.default,
		width: "100%",
		maxWidth: 390,
		gap: spacing.sm,
		padding: spacing.sm,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
		paddingLeft: spacing.xs,
	},
	titleStack: {
		flex: 1,
		gap: 2,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	subtitle: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
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
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
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
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
	},
	featuredDetailStack: {
		gap: 4,
	},
	featuredDetailLine: {
		minHeight: 22,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	featuredDetailText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
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
		minHeight: 108,
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 4,
		paddingVertical: spacing.xs,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
		gap: 4,
	},
	weekday: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
	},
	mealIconWrap: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
	},
	mealIconWrapFilled: {
		borderColor: tokens.color.status.success.background,
		backgroundColor: tokens.color.status.success.background,
	},
	mealIconWrapEmpty: {
		borderStyle: "dashed",
		borderColor: tokens.color.border.strong,
		backgroundColor: tokens.color.surface.card.default,
		opacity: 0.78,
	},
	scoreDot: {
		width: 14,
		height: 14,
		borderRadius: 7,
		borderWidth: 2,
	},
	scoreRow: {
		minHeight: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 1,
	},
	dayScore: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 15,
		fontVariant: ["tabular-nums"],
	},
	legendRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingTop: 2,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	legendDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: tokens.color.status.risk.medium.tint,
	},
	legendLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 11,
		lineHeight: 14,
	},
});

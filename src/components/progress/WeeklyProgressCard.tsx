import { Ionicons } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

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

			<View style={styles.sectionDivider} />

			<View style={styles.weekSummaryRow}>
				<Text style={styles.weekSummaryLabel}>This Week</Text>
			</View>

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
}: {
	iconName: IoniconName;
	text: string;
	onPress?: () => void;
}) {
	const content = (
		<>
			<Ionicons name={iconName} size={15} color={tokens.color.icon.accent} />
			<Text style={[styles.featuredDetailText, onPress && styles.featuredDetailTextLink]}>
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
			<Ionicons name="chevron-forward" size={14} color={tokens.color.icon.muted} />
		</Pressable>
	);
}

function DailyScoreRing({ score }: { score?: number }) {
	const size = 116;
	const strokeWidth = 11;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const hasScore = score !== undefined;
	const clampedScore = Math.max(0, Math.min(100, score ?? 0));
	const progressOffset = circumference * (1 - clampedScore / 100);
	const ringColor = hasScore ? scoreTint(clampedScore) : tokens.color.chart.track;

	return (
		<View
			style={styles.ringWrap}
			accessible
			accessibilityLabel={hasScore ? `Daily Score ${score}` : "Daily Score pending"}
		>
			<Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
				<Circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke={tokens.color.chart.track}
					strokeWidth={strokeWidth}
					fill="none"
					opacity={hasScore ? 0.58 : 0.78}
				/>
				{hasScore ? (
					<Circle
						cx={size / 2}
						cy={size / 2}
						r={radius}
						stroke={ringColor}
						strokeWidth={strokeWidth}
						fill="none"
						strokeLinecap="round"
						strokeDasharray={`${circumference} ${circumference}`}
						strokeDashoffset={progressOffset}
						rotation="-90"
						origin={`${size / 2}, ${size / 2}`}
					/>
				) : null}
			</Svg>
			<View style={styles.ringCenter}>
				<Text
					style={[
						styles.ringScore,
						{ color: hasScore ? ringColor : tokens.color.text.tertiary },
					]}
				>
					{hasScore ? score : "—"}
				</Text>
			</View>
		</View>
	);
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
					size={16}
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
					size={15}
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
	if (!gutSeverity || gutSeverity <= 1) return "no";
	if (gutSeverity <= 3) return "mild";
	if (gutSeverity <= 6) return "medium";
	return "severe";
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
		gap: spacing.md,
		padding: spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	titleStack: {
		flex: 1,
		gap: 3,
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
		fontSize: 13,
		lineHeight: 18,
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		minHeight: 24,
	},
	featuredWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		paddingVertical: spacing.xs,
	},
	ringWrap: {
		width: 116,
		height: 116,
		alignItems: "center",
		justifyContent: "center",
	},
	ringCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	ringScore: {
		fontFamily: type.body.bold,
		fontSize: 34,
		lineHeight: 39,
		fontVariant: ["tabular-nums"],
	},
	featuredCopy: {
		flex: 1,
		gap: spacing.sm,
	},
	featuredEyebrowRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	featuredEyebrow: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
	},
	featuredSeparatorDot: {
		width: 4,
		height: 4,
		borderRadius: 2,
		backgroundColor: tokens.color.text.tertiary,
		opacity: 0.7,
	},
	featuredDate: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	featuredDetailStack: {
		gap: spacing.xs,
	},
	featuredDetailLine: {
		minHeight: 25,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	featuredDetailText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 19,
	},
	featuredDetailTextLink: {
		color: tokens.color.text.accent,
	},
	sectionDivider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: tokens.color.border.emphasis,
	},
	weekSummaryRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	weekSummaryLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	daysRow: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	dayColumn: {
		flex: 1,
		minHeight: 142,
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 4,
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.frosted,
	},
	weekday: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	mealIconWrap: {
		width: 34,
		height: 34,
		borderRadius: 17,
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
		width: 18,
		height: 18,
		borderRadius: 9,
		borderWidth: 2,
	},
	scoreRow: {
		minHeight: 18,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 1,
	},
	dayScore: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 17,
		fontVariant: ["tabular-nums"],
	},
	legendRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.md,
		paddingTop: spacing.xs,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	legendDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: tokens.color.status.risk.medium.tint,
	},
	legendLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
});

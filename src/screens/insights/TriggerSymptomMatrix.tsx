import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radii, spacing, tokens, type } from "../../theme";
import { DailyGutReport, IngredientInsight, ScanRecord } from "../../types/domain";

type TriggerSymptomMatrixProps = {
	insights: IngredientInsight[];
	scans: ScanRecord[];
	reports: DailyGutReport[];
	onIngredientPress?: (ingredientName: string) => void;
};

type Cell = {
	ratio: number;
	hits: number;
	occurrences: number;
};

const MAX_ROWS = 5;
const MAX_COLS = 4;
const FALLBACK_SYMPTOMS = ["Reflux / Heartburn", "Bloating", "Gas", "Nausea"];

export function TriggerSymptomMatrix({
	insights,
	scans,
	reports,
	onIngredientPress,
}: TriggerSymptomMatrixProps) {
	const triggerInsights = insights
		.filter((insight) => insight.triggerScore >= insight.safeScore || insight.combinedRiskScore >= 52)
		.sort((left, right) => right.combinedRiskScore - left.combinedRiskScore)
		.slice(0, MAX_ROWS);

	const topSymptoms = pickTopSymptoms(reports);

	if (triggerInsights.length === 0 || topSymptoms.length === 0) {
		return null;
	}

	const reportsByDate = new Map<string, DailyGutReport>();
	for (const report of reports) {
		reportsByDate.set(report.localDate, report);
	}

	const matrix = triggerInsights.map((insight) =>
		buildRowForIngredient(insight, scans, reportsByDate, topSymptoms),
	);

	return (
		<View style={styles.card}>
			<View style={styles.header}>
				<Text style={styles.title}>Trigger pattern</Text>
				<Text style={styles.subtitle}>How your top triggers map to symptoms.</Text>
			</View>

			<View style={styles.matrix}>
				<View style={styles.headerRow}>
					<View style={styles.ingredientLabelHeader} />
					{topSymptoms.map((symptom) => (
						<Text key={symptom} style={styles.symptomHeader} numberOfLines={2}>
							{abbreviateSymptom(symptom)}
						</Text>
					))}
				</View>

				{triggerInsights.map((insight, rowIndex) => {
					const row = matrix[rowIndex] ?? [];
					const onPress = onIngredientPress
						? () => onIngredientPress(insight.ingredientName)
						: undefined;
					const label = (
						<Text style={styles.ingredientLabel} numberOfLines={1}>
							{insight.ingredientName}
						</Text>
					);

					return (
						<View key={insight.id} style={styles.bodyRow}>
							{onPress ? (
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`Open ${insight.ingredientName}`}
									onPress={onPress}
									hitSlop={6}
									style={({ pressed }) => [
										styles.ingredientLabelCell,
										pressed && { opacity: 0.7 },
									]}
								>
									{label}
								</Pressable>
							) : (
								<View style={styles.ingredientLabelCell}>{label}</View>
							)}
							{row.map((cell, columnIndex) => (
								<View
									key={`${insight.id}-${topSymptoms[columnIndex]}`}
									style={[styles.cell, { backgroundColor: cellColor(cell.ratio) }]}
								/>
							))}
						</View>
					);
				})}
			</View>

			<View style={styles.legendRow}>
				<Ionicons name="ellipse" size={9} color={cellColor(0)} />
				<Text style={styles.legendLabel}>Rare</Text>
				<Ionicons name="ellipse" size={9} color={cellColor(0.4)} />
				<Text style={styles.legendLabel}>Common</Text>
				<Ionicons name="ellipse" size={9} color={cellColor(0.8)} />
				<Text style={styles.legendLabel}>Strong</Text>
			</View>
		</View>
	);
}

function pickTopSymptoms(reports: DailyGutReport[]): string[] {
	const counts = new Map<string, number>();
	for (const report of reports) {
		for (const tag of report.symptomTags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}

	const sorted = Array.from(counts.entries())
		.filter(([tag]) => tag.toLowerCase() !== "none")
		.sort((a, b) => b[1] - a[1])
		.slice(0, MAX_COLS)
		.map(([tag]) => tag);

	if (sorted.length >= MAX_COLS) return sorted;

	const filled = [...sorted];
	for (const fallback of FALLBACK_SYMPTOMS) {
		if (filled.length >= MAX_COLS) break;
		if (!filled.includes(fallback)) filled.push(fallback);
	}
	return filled.slice(0, MAX_COLS);
}

function buildRowForIngredient(
	insight: IngredientInsight,
	scans: ScanRecord[],
	reportsByDate: Map<string, DailyGutReport>,
	symptoms: string[],
): Cell[] {
	const token = normalizeToken(insight.ingredientName);
	const sameDayReports: DailyGutReport[] = [];

	for (const scan of scans) {
		if ((scan.scanCategory ?? "food") !== "food") continue;
		const scanTokens = [
			scan.dishName,
			...scan.possibleTriggers,
			...scan.structuredAnalysis.visibleIngredients.map((ingredient) => ingredient.canonicalName),
			...scan.structuredAnalysis.inferredIngredients.map((ingredient) => ingredient.canonicalName),
		].map(normalizeToken);

		if (!scanTokens.some((value) => value.includes(token))) continue;
		const date = scanLocalDate(scan);
		const report = date ? reportsByDate.get(date) : undefined;
		if (report) sameDayReports.push(report);
	}

	const occurrences = sameDayReports.length;
	return symptoms.map((symptom) => {
		const hits = sameDayReports.reduce(
			(count, report) => (report.symptomTags.includes(symptom) ? count + 1 : count),
			0,
		);
		const ratio = occurrences === 0 ? 0 : hits / occurrences;
		return { ratio, hits, occurrences };
	});
}

function scanLocalDate(scan: ScanRecord): string | undefined {
	if (scan.localDate) return scan.localDate;
	const stamp = scan.completedAt ?? scan.createdAt;
	if (!stamp) return undefined;
	return toLocalDateString(new Date(stamp));
}

function toLocalDateString(date: Date) {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, "0");
	const day = `${date.getDate()}`.padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function normalizeToken(value: string | null | undefined) {
	return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "") ?? "";
}

function abbreviateSymptom(symptom: string) {
	const lookup: Record<string, string> = {
		"Reflux / Heartburn": "Reflux",
		Bloating: "Bloat",
		Constipation: "Const.",
		Diarrhea: "Diarr.",
	};
	return lookup[symptom] ?? symptom;
}

function cellColor(ratio: number) {
	if (ratio <= 0) return tokens.color.chart.track;
	if (ratio < 0.25) return tokens.color.status.risk.medium.background;
	if (ratio < 0.5) return tokens.color.status.risk.medium.tint;
	if (ratio < 0.75) return tokens.color.status.risk.high.background;
	return tokens.color.status.risk.high.tint;
}

const styles = StyleSheet.create({
	card: {
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: radii.lg,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		gap: spacing.md,
	},
	header: {
		gap: 2,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 16,
		lineHeight: 20,
	},
	subtitle: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.medium,
		fontSize: 12,
		lineHeight: 16,
	},
	matrix: {
		gap: 4,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 4,
	},
	ingredientLabelHeader: {
		flex: 1.3,
	},
	symptomHeader: {
		flex: 1,
		color: tokens.color.text.tertiary,
		fontFamily: type.body.bold,
		fontSize: 10,
		lineHeight: 13,
		letterSpacing: 0.4,
		textAlign: "center",
		textTransform: "uppercase",
	},
	bodyRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 36,
	},
	ingredientLabelCell: {
		flex: 1.3,
		paddingRight: spacing.xs,
	},
	ingredientLabel: {
		color: tokens.color.text.primary,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 17,
		textTransform: "capitalize",
	},
	cell: {
		flex: 1,
		aspectRatio: 1.5,
		borderRadius: 6,
	},
	legendRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: 6,
		flexWrap: "wrap",
	},
	legendLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 10,
		lineHeight: 13,
		marginRight: spacing.xs,
	},
});

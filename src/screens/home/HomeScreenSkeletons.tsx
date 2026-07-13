import { StyleSheet, View } from "react-native";

import { SectionCard, SkeletonBlock } from "../../components/common/UI";
import { radii, spacing, tokens } from "../../theme";

export function GutScoreHomeCardSkeleton() {
	return (
		<SectionCard style={styles.gutScoreCard}>
			<View style={styles.copyColumn}>
				<View style={styles.headerRow}>
					<SkeletonBlock width={84} height={22} radius={radii.sm} />
					<SkeletonBlock width={26} height={26} radius={13} />
				</View>
				<View style={styles.scoreRow}>
					<SkeletonBlock width={68} height={44} radius={radii.md} />
					<SkeletonBlock
						width={44}
						height={22}
						radius={radii.sm}
						style={styles.scoreScale}
					/>
				</View>
				<SkeletonBlock width={138} height={36} radius={radii.sm} />
				<View style={styles.trendRow}>
					<SkeletonBlock width={14} height={14} radius={7} />
					<SkeletonBlock width={108} height={14} radius={radii.sm} />
				</View>
			</View>
			<View style={styles.visualWrap}>
				<SkeletonBlock width={124} height={96} radius={radii.xxl} />
				<SkeletonBlock width={78} height={28} radius={radii.pill} />
			</View>
		</SectionCard>
	);
}

export function WeeklyProgressCardSkeleton() {
	return (
		<SectionCard style={styles.weeklyProgressCard}>
			<View style={styles.weeklyProgressHeader}>
				<View style={styles.copyColumn}>
					<SkeletonBlock width={118} height={20} radius={radii.sm} />
				</View>
				<SkeletonBlock width={16} height={16} radius={8} />
			</View>
			<View style={styles.weeklyProgressFeature}>
				<SkeletonBlock width={92} height={92} radius={46} />
				<View style={styles.weeklyProgressFeatureCopy}>
					<SkeletonBlock width={108} height={14} radius={radii.sm} />
					<SkeletonBlock width="90%" height={16} radius={radii.sm} />
					<SkeletonBlock width="82%" height={16} radius={radii.sm} />
				</View>
			</View>
			<View style={styles.weeklyProgressDays}>
				{[0, 1, 2, 3, 4, 5, 6].map((item) => (
					<View key={item} style={styles.weeklyProgressDay}>
						<SkeletonBlock width={12} height={12} radius={radii.sm} />
						<SkeletonBlock width={24} height={24} radius={12} />
						<SkeletonBlock width={14} height={14} radius={7} />
						<SkeletonBlock width={20} height={12} radius={radii.sm} />
					</View>
				))}
			</View>
			<SkeletonBlock width="78%" height={12} radius={radii.sm} />
		</SectionCard>
	);
}

const styles = StyleSheet.create({
	gutScoreCard: {
		minHeight: 168,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
		paddingVertical: spacing.md,
	},
	copyColumn: {
		flex: 1,
		minWidth: 0,
		gap: spacing.xs,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginBottom: spacing.xs,
	},
	scoreRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.xs,
	},
	scoreScale: {
		marginBottom: 8,
	},
	trendRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		marginTop: spacing.xs,
	},
	visualWrap: {
		width: 132,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	weeklyProgressCard: {
		gap: spacing.sm,
		padding: spacing.sm,
	},
	weeklyProgressHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	weeklyProgressFeature: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	weeklyProgressFeatureCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	weeklyProgressDays: {
		flexDirection: "row",
		gap: spacing.xs,
	},
	weeklyProgressDay: {
		flex: 1,
		minHeight: 108,
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.xs,
		borderRadius: radii.md,
		backgroundColor: tokens.color.surface.app.default,
	},
});

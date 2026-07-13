import { StyleSheet, Text, View } from "react-native";

import { Pip } from "../../components/common/Pip";
import { SectionCard, SkeletonBlock, verdictTone } from "../../components/common/UI";
import {
	type TriggerProfileViewState,
	type TriggerStatus,
} from "../../features/insights/triggerProfile";
import { radii, spacing, tokens, type, type PipState } from "../../theme";
import { STATUS_LABEL } from "./statusVisuals";

const CASEBOARD_STATUSES: TriggerStatus[] = [
	"confirmed",
	"suspect",
	"watching",
	"safe",
	"cleared",
];
const HERO_NAME_LIMIT = 3;

type CaseboardStory = {
	headline: string;
	names?: string;
	support: string;
	pip: PipState;
};

// The hero answers "what's triggering me?" first: a Bricolage verdict sentence,
// the confirmed names, then the five caseboard counts. Honest at every stage -
// no verdicts yet reads as an open case, not a celebration.
function caseboardStory(viewState: TriggerProfileViewState): CaseboardStory {
	const counts = viewState.counts;

	if (counts.confirmed > 0) {
		const confirmedSection = viewState.sections.find((section) => section.status === "confirmed");
		const labels = confirmedSection?.entries.map((entry) => entry.label) ?? [];
		const shown = labels.slice(0, HERO_NAME_LIMIT).join(", ");
		const names =
			labels.length > HERO_NAME_LIMIT
				? `${shown} +${labels.length - HERO_NAME_LIMIT} more`
				: shown;
		return {
			headline: `${counts.confirmed} confirmed trigger${counts.confirmed === 1 ? "" : "s"}`,
			names: names || undefined,
			support:
				counts.suspects > 0
					? `${counts.suspects} case${counts.suspects === 1 ? "" : "s"} still under review — check-ins settle them.`
					: "Backed by repeated rough-day evidence from your check-ins.",
			pip: "base",
		};
	}

	if (counts.suspects > 0) {
		return {
			headline: "No confirmed triggers yet",
			support: `${counts.suspects} suspect${counts.suspects === 1 ? "" : "s"} under review — each check-in moves the case.`,
			pip: "thinking",
		};
	}

	if (counts.cleared > 0 || counts.safe > 0) {
		return {
			headline: "No triggers so far",
			support:
				counts.cleared > 0
					? `${counts.cleared} food${counts.cleared === 1 ? "" : "s"} cleared for good — the rest are still earning it.`
					: `${counts.safe} food${counts.safe === 1 ? "" : "s"} looking safe — a few more calm days each earns cleared.`,
			pip: "joy",
		};
	}

	return {
		headline: "The case is just opening",
		support: `Watching ${counts.watching} food${counts.watching === 1 ? "" : "s"} from your scans — paired check-ins bring the first verdicts.`,
		pip: "thinking",
	};
}

function caseboardCountForStatus(viewState: TriggerProfileViewState, status: TriggerStatus) {
	if (status === "confirmed") return viewState.counts.confirmed;
	if (status === "suspect") return viewState.counts.suspects;
	if (status === "watching") return viewState.counts.watching;
	if (status === "safe") return viewState.counts.safe;
	return viewState.counts.cleared;
}

// The screen's one hero block: the verdict statement lives on the warm
// hero surface, and the five verdict-tone count cells pin to it like case
// tabs - white chips that stay legible against the peach-cream.
export function CaseboardHero({ viewState }: { viewState: TriggerProfileViewState }) {
	const story = caseboardStory(viewState);

	return (
		<SectionCard style={styles.heroCard}>
			<View style={styles.heroTopRow}>
				<View style={styles.heroCopy}>
					<Text style={styles.heroEyebrow}>The caseboard</Text>
					<Text style={styles.heroHeadline}>{story.headline}</Text>
					{story.names ? (
						<Text style={styles.heroNames} numberOfLines={2}>
							{story.names}
						</Text>
					) : null}
					<Text style={styles.heroSupport}>{story.support}</Text>
				</View>
				<View style={styles.heroPip}>
					<Pip state={story.pip} size={76} />
				</View>
			</View>
			<View style={styles.caseboardRow}>
				{CASEBOARD_STATUSES.map((status) => (
					<CaseboardCount
						key={status}
						status={status}
						value={caseboardCountForStatus(viewState, status)}
					/>
				))}
			</View>
		</SectionCard>
	);
}

function CaseboardCount({ status, value }: { status: TriggerStatus; value: number }) {
	const tone = verdictTone(status);

	return (
		<View
			accessible
			accessibilityLabel={`${STATUS_LABEL[status]}: ${value}`}
			style={[styles.caseboardCell, { backgroundColor: tone.background }]}
		>
			<Text style={[styles.caseboardCellValue, { color: tone.foreground }]}>{value}</Text>
			<Text
				style={[styles.caseboardCellLabel, { color: tone.foreground }]}
				numberOfLines={2}
				adjustsFontSizeToFit
				minimumFontScale={0.8}
			>
				{STATUS_LABEL[status]}
			</Text>
		</View>
	);
}

export function CaseboardHeroSkeleton() {
	return (
		<View style={styles.heroStack}>
			<SectionCard style={styles.heroCard}>
				<View style={styles.heroCopy}>
					<SkeletonBlock width="34%" height={12} radius={radii.sm} />
					<SkeletonBlock width="72%" height={38} radius={radii.md} />
					<SkeletonBlock width="88%" height={14} radius={radii.sm} />
				</View>
				<View style={styles.caseboardRow}>
					{CASEBOARD_STATUSES.map((status) => (
						<SkeletonBlock key={status} width="18%" height={78} radius={radii.md} />
					))}
				</View>
			</SectionCard>
			<SkeletonBlock width="100%" height={56} radius={radii.pill} />
			<SkeletonBlock width="100%" height={78} radius={radii.lg} />
		</View>
	);
}

const styles = StyleSheet.create({
	heroStack: {
		gap: spacing.sm,
	},
	heroCard: {
		gap: spacing.md,
		backgroundColor: tokens.color.surface.hero.background,
		...tokens.shadow.lift,
	},
	heroTopRow: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.sm,
	},
	heroCopy: {
		flex: 1,
		gap: spacing.xs,
	},
	heroEyebrow: {
		...tokens.type.label.eyebrow,
		color: tokens.color.surface.hero.onHeroFaint,
		textTransform: "uppercase",
	},
	heroHeadline: {
		...tokens.type.display.hero,
		color: tokens.color.surface.hero.onHero,
	},
	heroNames: {
		...tokens.type.display.accent,
		color: tokens.color.surface.hero.onHero,
	},
	heroSupport: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.surface.hero.onHeroMuted,
	},
	heroPip: {
		width: 80,
		alignItems: "center",
		justifyContent: "flex-end",
	},
	caseboardRow: {
		flexDirection: "row",
		alignItems: "stretch",
		gap: tokens.space.xxs,
	},
	caseboardCell: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
		minHeight: 78,
		borderRadius: radii.md,
		paddingHorizontal: tokens.space.xxs,
		paddingVertical: spacing.xs,
	},
	caseboardCellValue: {
		...tokens.type.display.accent,
	},
	caseboardCellLabel: {
		...tokens.type.label.tab,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
	},
});

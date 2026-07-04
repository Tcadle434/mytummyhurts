import { Pressable, StyleSheet, Text, View } from "react-native";

import { PORTION_OPTIONS } from "../../features/scan/consumptionPortions";
import { palette, spacing, tokens, type } from "../../theme";
import type { ConsumptionPortion } from "../../types/domain";

// The one-tap portion refinement on a confirmed meal (Phase 4): three small
// options, normal preselected, zero extra friction — skipping it still records
// a normal portion. Lives inside the existing confirm affordance on both the
// food scan card (light surface) and the menu top-pick spotlight (evergreen
// hero surface), hence the onHero variant.
export function PortionChoiceRow({
	value,
	onSelect,
	onHero = false,
}: {
	value: ConsumptionPortion;
	onSelect: (portion: ConsumptionPortion) => void;
	onHero?: boolean;
}) {
	return (
		<View style={styles.row}>
			<Text style={[styles.label, onHero && styles.labelOnHero]}>How much?</Text>
			<View style={styles.chips}>
				{PORTION_OPTIONS.map((option) => {
					const active = option.value === value;
					return (
						<Pressable
							key={option.value}
							accessibilityRole="button"
							accessibilityState={{ selected: active }}
							accessibilityLabel={`${option.label} portion`}
							onPress={() => onSelect(option.value)}
							style={({ pressed }) => [
								styles.chip,
								onHero ? styles.chipOnHero : null,
								active && (onHero ? styles.chipOnHeroActive : styles.chipActive),
								pressed && styles.pressedDim,
							]}
						>
							<Text
								style={[
									styles.chipText,
									onHero ? styles.chipTextOnHero : null,
									active && (onHero ? styles.chipTextOnHeroActive : styles.chipTextActive),
								]}
							>
								{option.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	pressedDim: {
		opacity: 0.88,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	label: {
		...tokens.type.body.small,
		fontFamily: type.body.medium,
		color: tokens.color.text.tertiary,
	},
	labelOnHero: {
		color: tokens.color.surface.hero.onHeroMuted,
	},
	chips: {
		flex: 1,
		flexDirection: "row",
		gap: spacing.xs,
	},
	// Light-surface chips echo the ConsumeChoice idiom: subtle outline at rest,
	// success tint + brand border when selected.
	chip: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 36,
		borderRadius: tokens.radius.pill,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		backgroundColor: tokens.color.surface.card.default,
		paddingHorizontal: spacing.sm,
	},
	chipActive: {
		borderColor: palette.primary,
		backgroundColor: tokens.color.surface.card.success,
	},
	// On the evergreen hero: soft raised discs at rest, solid porcelain when
	// selected — no hairlines against the dark surface.
	chipOnHero: {
		borderWidth: 0,
		backgroundColor: tokens.color.surface.hero.raised,
	},
	chipOnHeroActive: {
		backgroundColor: tokens.color.surface.card.default,
	},
	chipText: {
		...tokens.type.label.chip,
		color: palette.textMuted,
	},
	chipTextActive: {
		color: palette.primaryDark,
	},
	chipTextOnHero: {
		color: tokens.color.surface.hero.onHeroMuted,
	},
	chipTextOnHeroActive: {
		color: palette.primaryDark,
	},
});

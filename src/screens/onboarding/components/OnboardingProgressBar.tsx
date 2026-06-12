import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { palette, tokens } from "../../../theme";
import { onboardingMotion } from "./motion";

type OnboardingProgressBarProps = {
	progress: number;
};

export function OnboardingProgressBar({ progress }: OnboardingProgressBarProps) {
	const clamped = clampProgress(progress);
	const fill = useSharedValue(clamped);
	const reducedMotion = useReducedMotion();

	useEffect(() => {
		fill.value = reducedMotion
			? withTiming(clamped, onboardingMotion.timing.quick)
			: withSpring(clamped, onboardingMotion.spring.progress);
	}, [clamped, fill, reducedMotion]);

	const fillStyle = useAnimatedStyle(() => ({
		width: `${fill.value * 100}%`,
	}));

	return (
		<View
			accessibilityRole="progressbar"
			accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
			style={styles.track}
		>
			<Animated.View style={[styles.fill, fillStyle]} />
		</View>
	);
}

function clampProgress(value: number) {
	if (Number.isNaN(value)) return 0;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

const styles = StyleSheet.create({
	track: {
		flex: 1,
		height: 10,
		borderRadius: 99,
		backgroundColor: tokens.color.chart.track,
		overflow: "hidden",
	},
	fill: {
		height: "100%",
		borderRadius: 99,
		backgroundColor: palette.primary,
	},
});

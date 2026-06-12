import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { Pip } from "../../../components/common/Pip";
import { PipState } from "../../../theme";
import { onboardingMotion } from "./motion";

type OnboardingPipCompanionProps = {
	state: PipState;
	size?: number;
};

export function OnboardingPipCompanion({ state, size = 44 }: OnboardingPipCompanionProps) {
	const bob = useSharedValue(0);
	const pop = useSharedValue(1);
	const reducedMotion = useReducedMotion();

	useEffect(() => {
		if (reducedMotion) {
			bob.value = 0;
			return;
		}

		bob.value = withRepeat(
			withSequence(
				withTiming(-3, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
				withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) })
			),
			-1,
			false
		);
	}, [bob, reducedMotion]);

	useEffect(() => {
		if (reducedMotion) {
			return;
		}

		pop.value = withSequence(
			withSpring(1.12, onboardingMotion.spring.pop),
			withDelay(60, withSpring(1, onboardingMotion.spring.release))
		);
	}, [state, pop, reducedMotion]);

	const wrapStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: bob.value }, { scale: pop.value }],
	}));

	return (
		<Animated.View
			pointerEvents="none"
			accessibilityElementsHidden
			importantForAccessibility="no"
			style={[styles.wrap, { width: size, height: size }, wrapStyle]}
		>
			<Animated.View
				key={state}
				entering={FadeIn.duration(220)}
				exiting={FadeOut.duration(160)}
				style={StyleSheet.absoluteFillObject}
			>
				<Pip state={state} size={size} accessibilityLabel="Pip" />
			</Animated.View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignItems: "center",
		justifyContent: "center",
	},
});

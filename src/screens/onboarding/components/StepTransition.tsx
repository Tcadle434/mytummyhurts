import { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
	FadeIn,
	FadeInLeft,
	FadeInRight,
	FadeOut,
	FadeOutLeft,
	FadeOutRight,
	useReducedMotion,
} from "react-native-reanimated";

import { onboardingMotion } from "./motion";

export type StepTransitionDirection = "forward" | "backward";

type StepTransitionProps = {
	stepKey: string;
	direction: StepTransitionDirection;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
};

const SLIDE_OFFSET = 40;

export function StepTransition({ stepKey, direction, children, style }: StepTransitionProps) {
	const reducedMotion = useReducedMotion();

	if (reducedMotion) {
		return (
			<Animated.View
				key={stepKey}
				entering={FadeIn.duration(160)}
				exiting={FadeOut.duration(120)}
				style={[styles.fill, style]}
			>
				{children}
			</Animated.View>
		);
	}

	const { damping, stiffness, mass } = onboardingMotion.spring.content;
	const enterOffset = direction === "forward" ? SLIDE_OFFSET : -SLIDE_OFFSET;
	const enterPreset = direction === "forward" ? FadeInRight : FadeInLeft;
	const exitPreset = direction === "forward" ? FadeOutLeft : FadeOutRight;

	const entering = enterPreset
		.springify()
		.damping(damping)
		.stiffness(stiffness)
		.mass(mass)
		.withInitialValues({ transform: [{ translateX: enterOffset }] });

	const exiting = exitPreset.duration(180);

	return (
		<Animated.View
			key={stepKey}
			entering={entering}
			exiting={exiting}
			style={[styles.fill, style]}
		>
			{children}
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	fill: {
		flex: 1,
		width: "100%",
	},
});

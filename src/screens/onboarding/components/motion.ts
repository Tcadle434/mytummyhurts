import { Easing, WithSpringConfig, WithTimingConfig } from "react-native-reanimated";

export const onboardingMotion = {
	spring: {
		content: {
			damping: 20,
			stiffness: 170,
			mass: 0.9,
		} satisfies WithSpringConfig,
		progress: {
			damping: 22,
			stiffness: 140,
			mass: 0.8,
		} satisfies WithSpringConfig,
		press: {
			damping: 16,
			stiffness: 360,
			mass: 0.6,
		} satisfies WithSpringConfig,
		release: {
			damping: 14,
			stiffness: 220,
			mass: 0.7,
		} satisfies WithSpringConfig,
		pop: {
			damping: 11,
			stiffness: 280,
			mass: 0.55,
		} satisfies WithSpringConfig,
	},
	timing: {
		fade: {
			duration: 220,
			easing: Easing.out(Easing.cubic),
		} satisfies WithTimingConfig,
		quick: {
			duration: 160,
			easing: Easing.out(Easing.cubic),
		} satisfies WithTimingConfig,
	},
	stagger: {
		base: 80,
		step: 50,
	},
} as const;

import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

export const STAGGER_BASE_MS = 80;
export const STAGGER_STEP_MS = 50;
export const ENTER_DURATION_MS = 360;
export const INGREDIENT_SENSITIVITY_UNKNOWN_OPTION = "I'm not sure";

export function StaggerItem({
	children,
	delayMs,
	style,
}: {
	children: ReactNode;
	delayMs: number;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<Animated.View entering={FadeInUp.duration(ENTER_DURATION_MS).delay(delayMs)} style={style}>
			{children}
		</Animated.View>
	);
}

export function optionDelayMs(index: number) {
	return STAGGER_BASE_MS + STAGGER_STEP_MS * 2 + index * 36;
}

import { Image, StyleSheet, View } from "react-native";

import { tokens } from "../../../theme";

const HOME_SCREENSHOT = require("../../../../assets/ui/home_screenshot_onboarding.png");

const SCREENSHOT_NATIVE_WIDTH = 1320;
const SCREENSHOT_NATIVE_HEIGHT = 2868;
const PHONE_WIDTH = 252;
const BEZEL_THICKNESS = 8;
const SCREEN_WIDTH = PHONE_WIDTH - BEZEL_THICKNESS * 2;
const SCREEN_HEIGHT = SCREEN_WIDTH * (SCREENSHOT_NATIVE_HEIGHT / SCREENSHOT_NATIVE_WIDTH);
const PHONE_HEIGHT = SCREEN_HEIGHT + BEZEL_THICKNESS * 2;

export function TrialFreePreview() {
	return (
		<View style={styles.wrap}>
			<View style={styles.phoneFrame}>
				<View style={styles.phoneScreen}>
					<Image
						source={HOME_SCREENSHOT}
						style={styles.screenshot}
						resizeMode="cover"
						accessibilityIgnoresInvertColors
					/>
				</View>
				<View style={styles.dynamicIsland} pointerEvents="none" />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		alignItems: "center",
	},
	phoneFrame: {
		width: PHONE_WIDTH,
		height: PHONE_HEIGHT,
		borderRadius: 38,
		backgroundColor: "#111111",
		padding: BEZEL_THICKNESS,
		...tokens.shadow.lift,
	},
	phoneScreen: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		borderRadius: 30,
		overflow: "hidden",
		backgroundColor: tokens.color.surface.card.default,
	},
	screenshot: {
		width: "100%",
		height: "100%",
	},
	dynamicIsland: {
		position: "absolute",
		top: BEZEL_THICKNESS + 6,
		alignSelf: "center",
		width: 78,
		height: 20,
		borderRadius: 10,
		backgroundColor: "#000000",
	},
});

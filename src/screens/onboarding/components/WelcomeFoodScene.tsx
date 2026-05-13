import {
	BlurMask,
	Canvas,
	Circle as SkiaCircle,
	Path as SkiaPath,
} from "@shopify/react-native-skia";
import { Image, StyleSheet, View } from "react-native";

import { spacing } from "../../../theme";

const PIP_WELCOME_GIF = require("../../../../assets/pip/pip_welcome_gif_transparent.gif");
const BANANA_ASSET = require("../../../../assets/ui/banana_transparent.png");
const CARROT_ASSET = require("../../../../assets/ui/carrot_transparent.png");
const PLANT_1_ASSET = require("../../../../assets/ui/plant_1_transparent.png");
const PLANT_2_ASSET = require("../../../../assets/ui/plant_2_transparent.png");
const PLANT_3_ASSET = require("../../../../assets/ui/plant_3_transparent.png");
const RICE_ASSET = require("../../../../assets/ui/rice_transparent.png");
const TOAST_ASSET = require("../../../../assets/ui/toast_transparent.png");

const WELCOME_SWIRLS = [
	{
		path: "M-5 159 C49 88 158 48 276 72 C363 90 405 139 365 181 C314 234 173 228 75 190",
		opacity: 0.14,
		strokeWidth: 1.15,
		blur: 1.8,
	},
	{
		path: "M386 112 C321 161 225 171 137 143 C75 123 41 95 55 76 C74 50 151 65 199 95",
		opacity: 0.11,
		strokeWidth: 1,
		blur: 1.6,
	},
	{
		path: "M45 125 C93 166 185 181 268 153 C322 135 353 105 342 82 C327 51 240 55 181 91",
		opacity: 0.1,
		strokeWidth: 0.95,
		blur: 1.45,
	},
	{
		path: "M137 123 C158 96 206 91 234 116 C255 135 246 164 215 172 C179 183 138 166 132 143",
		opacity: 0.09,
		strokeWidth: 0.9,
		blur: 1.2,
	},
	{
		path: "M291 118 C319 92 354 95 364 117 C372 136 351 153 323 147",
		opacity: 0.08,
		strokeWidth: 0.85,
		blur: 1.1,
	},
	{
		path: "M70 109 C92 84 129 79 155 96 C177 110 172 132 148 142",
		opacity: 0.08,
		strokeWidth: 0.85,
		blur: 1.1,
	},
];

const WELCOME_SPARKLES = [
	{ cx: 71, cy: 82, r: 1.7, opacity: 0.22 },
	{ cx: 99, cy: 69, r: 1.15, opacity: 0.18 },
	{ cx: 284, cy: 76, r: 1.8, opacity: 0.22 },
	{ cx: 329, cy: 113, r: 1.25, opacity: 0.18 },
	{ cx: 108, cy: 181, r: 1.2, opacity: 0.16 },
	{ cx: 256, cy: 172, r: 1.35, opacity: 0.16 },
];

/**
 * Decorative welcome-stage cluster used only on the first onboarding screen.
 * Keeping the Skia swirl drawing and floating assets isolated prevents the
 * main onboarding flow from owning animation/art-direction details.
 */
export function WelcomeFoodScene() {
	return (
		<View style={styles.scene} pointerEvents="none">
			<WelcomeSwirls />

			<Image source={RICE_ASSET} style={[styles.floatingAsset, styles.riceAsset]} resizeMode="contain" />
			<Image
				source={BANANA_ASSET}
				style={[styles.floatingAsset, styles.bananaAsset]}
				resizeMode="contain"
			/>
			<Image
				source={CARROT_ASSET}
				style={[styles.floatingAsset, styles.carrotAsset]}
				resizeMode="contain"
			/>
			<Image
				source={TOAST_ASSET}
				style={[styles.floatingAsset, styles.toastAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_1_ASSET}
				style={[styles.floatingAsset, styles.plantOneAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_2_ASSET}
				style={[styles.floatingAsset, styles.plantTwoAsset]}
				resizeMode="contain"
			/>
			<Image
				source={PLANT_3_ASSET}
				style={[styles.floatingAsset, styles.plantThreeAsset]}
				resizeMode="contain"
			/>

			<Image
				source={PIP_WELCOME_GIF}
				style={styles.welcomeGif}
				resizeMode="contain"
				accessibilityLabel="Pip waving hello"
			/>
		</View>
	);
}

function WelcomeSwirls() {
	return (
		<View pointerEvents="none" style={styles.swirlLayer}>
			<Canvas style={StyleSheet.absoluteFill}>
				{WELCOME_SWIRLS.map((swirl) => (
					<SkiaPath
						key={`soft-${swirl.path}`}
						path={swirl.path}
						color="white"
						opacity={swirl.opacity}
						style="stroke"
						strokeWidth={swirl.strokeWidth + 2}
						strokeCap="round"
					>
						<BlurMask blur={swirl.blur} style="normal" />
					</SkiaPath>
				))}
				{WELCOME_SWIRLS.map((swirl) => (
					<SkiaPath
						key={`line-${swirl.path}`}
						path={swirl.path}
						color="white"
						opacity={swirl.opacity * 0.8}
						style="stroke"
						strokeWidth={swirl.strokeWidth}
						strokeCap="round"
					/>
				))}
				{WELCOME_SPARKLES.map((sparkle) => (
					<SkiaCircle
						key={`${sparkle.cx}-${sparkle.cy}`}
						cx={sparkle.cx}
						cy={sparkle.cy}
						r={sparkle.r}
						color="white"
						opacity={sparkle.opacity}
					/>
				))}
			</Canvas>
		</View>
	);
}

const styles = StyleSheet.create({
	scene: {
		alignSelf: "center",
		width: "100%",
		maxWidth: 360,
		height: 248,
		alignItems: "center",
		justifyContent: "center",
		marginTop: spacing.sm,
		marginBottom: -spacing.md,
	},
	floatingAsset: {
		position: "absolute",
	},
	swirlLayer: {
		position: "absolute",
		left: -34,
		right: -34,
		top: -18,
		bottom: -8,
	},
	riceAsset: {
		left: 8,
		top: 56,
		width: 80,
		height: 80,
		transform: [{ rotate: "-8deg" }],
	},
	bananaAsset: {
		left: 72,
		top: 142,
		width: 72,
		height: 72,
		transform: [{ rotate: "-12deg" }],
	},
	carrotAsset: {
		left: 20,
		bottom: 4,
		width: 76,
		height: 76,
		transform: [{ rotate: "-18deg" }],
	},
	toastAsset: {
		right: 12,
		top: 134,
		width: 84,
		height: 84,
		transform: [{ rotate: "12deg" }],
	},
	plantOneAsset: {
		left: 76,
		top: 26,
		width: 42,
		height: 42,
		transform: [{ rotate: "-20deg" }],
	},
	plantTwoAsset: {
		right: 56,
		top: 72,
		width: 46,
		height: 46,
		transform: [{ rotate: "18deg" }],
	},
	plantThreeAsset: {
		right: 91,
		bottom: 23,
		width: 46,
		height: 46,
		transform: [{ rotate: "-8deg" }],
	},
	welcomeGif: {
		width: 150,
		height: 150,
	},
});

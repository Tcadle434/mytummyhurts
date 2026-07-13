import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
	Animated,
	Easing,
	Image,
	type ImageSourcePropType,
	StyleSheet,
	Text,
	View,
} from "react-native";

import { Pip } from "../../../components/common/Pip";
import { palette, spacing, tokens, type } from "../../../theme";
import { withAlpha } from "../../../theme/helpers";

const SCANNER_IMAGE_NATIVE_WIDTH = 1086;
const SCANNER_IMAGE_NATIVE_HEIGHT = 1448;
const SCAN_LINE_GLOW_HEIGHT = 56;
const CORNER_BRACKET_SIZE = 22;
const CORNER_BRACKET_THICKNESS = 3;

type ScannerImageViewProps = {
	source: ImageSourcePropType;
	imageHeight: number;
	headline: string;
};

export function ScannerImageView({
	source,
	imageHeight,
	headline,
}: ScannerImageViewProps) {
	const width = imageHeight * (SCANNER_IMAGE_NATIVE_WIDTH / SCANNER_IMAGE_NATIVE_HEIGHT);
	const breath = useRef(new Animated.Value(0)).current;
	const sweep = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const breathLoop = Animated.loop(
			Animated.sequence([
				Animated.timing(breath, {
					toValue: 1,
					duration: 1800,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.timing(breath, {
					toValue: 0,
					duration: 1800,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
			])
		);
		const sweepLoop = Animated.loop(
			Animated.sequence([
				Animated.timing(sweep, {
					toValue: 1,
					duration: 1800,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.delay(180),
				Animated.timing(sweep, {
					toValue: 0,
					duration: 0,
					useNativeDriver: true,
				}),
				Animated.delay(120),
			])
		);
		breathLoop.start();
		sweepLoop.start();
		return () => {
			breathLoop.stop();
			sweepLoop.stop();
		};
	}, [breath, sweep]);

	const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
	const sweepTravel = imageHeight - SCAN_LINE_GLOW_HEIGHT;
	const translateY = sweep.interpolate({
		inputRange: [0, 1],
		outputRange: [0, sweepTravel],
	});

	return (
		<View style={styles.scannerSlot}>
			<Text style={styles.scannerHeadline}>{headline}</Text>
			<Animated.View
				style={[
					styles.scannerFrame,
					{ width, height: imageHeight, transform: [{ scale }] },
				]}
			>
				<Image
					source={source}
					style={styles.scannerImage}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
				<Animated.View
					pointerEvents="none"
					style={[styles.scanSweep, { width, transform: [{ translateY }] }]}
				>
					<LinearGradient
						colors={[withAlpha(palette.primary, 0), withAlpha(palette.primary, 0.28)]}
						style={styles.scanGlow}
					/>
					<View style={styles.scanLine} />
				</Animated.View>
				<CornerBracket position="topLeft" />
				<CornerBracket position="topRight" />
				<CornerBracket position="bottomLeft" />
				<CornerBracket position="bottomRight" />
			</Animated.View>
		</View>
	);
}

type CornerBracketPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

function CornerBracket({ position }: { position: CornerBracketPosition }) {
	return <View style={[styles.cornerBracket, styles[`corner_${position}`]]} />;
}

export function AnalyzingView({ label }: { label: string }) {
	return (
		<View style={styles.analyzingCard}>
			<View style={styles.analyzingPip}>
				<Pip state="thinking" size={84} />
			</View>
			<Text style={styles.analyzingTitle}>{label}</Text>
			<AnalyzingDots />
			<Text style={styles.analyzingSubtitle}>Checking your profile for likely triggers…</Text>
		</View>
	);
}

function AnalyzingDots() {
	const dot1 = useRef(new Animated.Value(0.3)).current;
	const dot2 = useRef(new Animated.Value(0.3)).current;
	const dot3 = useRef(new Animated.Value(0.3)).current;

	useEffect(() => {
		const makeAnim = (value: Animated.Value, delay: number) =>
			Animated.loop(
				Animated.sequence([
					Animated.delay(delay),
					Animated.timing(value, {
						toValue: 1,
						duration: 360,
						easing: Easing.out(Easing.quad),
						useNativeDriver: true,
					}),
					Animated.timing(value, {
						toValue: 0.3,
						duration: 360,
						easing: Easing.in(Easing.quad),
						useNativeDriver: true,
					}),
				])
			);

		const animations = [makeAnim(dot1, 0), makeAnim(dot2, 160), makeAnim(dot3, 320)];
		animations.forEach((animation) => animation.start());
		return () => animations.forEach((animation) => animation.stop());
	}, [dot1, dot2, dot3]);

	return (
		<View style={styles.dotsRow}>
			<Animated.View style={[styles.dot, { opacity: dot1, transform: [{ scale: dot1 }] }]} />
			<Animated.View style={[styles.dot, { opacity: dot2, transform: [{ scale: dot2 }] }]} />
			<Animated.View style={[styles.dot, { opacity: dot3, transform: [{ scale: dot3 }] }]} />
		</View>
	);
}

const styles = StyleSheet.create({
	scannerSlot: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
		gap: spacing.md,
	},
	scannerHeadline: {
		color: palette.primary,
		fontFamily: type.body.bold,
		fontSize: 24,
		lineHeight: 30,
		textAlign: "center",
		letterSpacing: -0.4,
	},
	scannerFrame: {
		position: "relative",
		overflow: "hidden",
	},
	scannerImage: {
		width: "100%",
		height: "100%",
	},
	scanSweep: {
		position: "absolute",
		top: 0,
		left: 0,
		height: SCAN_LINE_GLOW_HEIGHT,
		justifyContent: "flex-end",
	},
	scanGlow: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	scanLine: {
		height: 2,
		backgroundColor: palette.primary,
		shadowColor: palette.primary,
		shadowOpacity: 0.9,
		shadowRadius: 6,
		shadowOffset: { width: 0, height: 0 },
	},
	cornerBracket: {
		position: "absolute",
		width: CORNER_BRACKET_SIZE,
		height: CORNER_BRACKET_SIZE,
		borderColor: palette.primary,
	},
	corner_topLeft: {
		top: 8,
		left: 8,
		borderTopWidth: CORNER_BRACKET_THICKNESS,
		borderLeftWidth: CORNER_BRACKET_THICKNESS,
		borderTopLeftRadius: 6,
	},
	corner_topRight: {
		top: 8,
		right: 8,
		borderTopWidth: CORNER_BRACKET_THICKNESS,
		borderRightWidth: CORNER_BRACKET_THICKNESS,
		borderTopRightRadius: 6,
	},
	corner_bottomLeft: {
		bottom: 8,
		left: 8,
		borderBottomWidth: CORNER_BRACKET_THICKNESS,
		borderLeftWidth: CORNER_BRACKET_THICKNESS,
		borderBottomLeftRadius: 6,
	},
	corner_bottomRight: {
		bottom: 8,
		right: 8,
		borderBottomWidth: CORNER_BRACKET_THICKNESS,
		borderRightWidth: CORNER_BRACKET_THICKNESS,
		borderBottomRightRadius: 6,
	},
	analyzingCard: {
		width: "100%",
		borderRadius: 28,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingVertical: spacing.xl,
		paddingHorizontal: spacing.lg,
		alignItems: "center",
		gap: spacing.md,
		...tokens.shadow.card,
	},
	analyzingPip: {
		alignItems: "center",
		justifyContent: "center",
	},
	analyzingTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 22,
		lineHeight: 28,
		textAlign: "center",
	},
	analyzingSubtitle: {
		color: palette.textMuted,
		fontFamily: type.body.regular,
		fontSize: 14,
		lineHeight: 19,
		textAlign: "center",
	},
	dotsRow: {
		flexDirection: "row",
		gap: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xs,
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: palette.primary,
	},
});

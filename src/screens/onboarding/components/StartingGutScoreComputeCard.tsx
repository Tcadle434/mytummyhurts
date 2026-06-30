import { Ionicons } from "@expo/vector-icons";
import { ComponentProps, useEffect, useState } from "react";
import { ImageSourcePropType, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedProps,
	useAnimatedStyle,
	useSharedValue,
	withDelay,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { palette, spacing, tokens, type } from "../../../theme";
import { gutScoreTint } from "../../../utils/risk";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type StartingScoreState = "ready" | "loading" | "revealed";

const PIP_ANXIOUS = require("../../../../assets/pip/pip_anxious_transparent.png");
const PIP_BASE = require("../../../../assets/pip/pip_base_transparent.png");
const PIP_SUBTLE = require("../../../../assets/pip/pip_subtle_transparent.png");

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Reveals a user's deterministic onboarding baseline without navigating to a
 * separate screen. The component owns only presentation animation; the score
 * itself is computed upstream by the scoring engine.
 */
export function StartingGutScoreComputeCard({
	score,
	state,
}: {
	score: number;
	state: StartingScoreState;
}) {
	const ringProgress = useSharedValue(state === "revealed" ? score / 100 : 0.16);
	const ringScale = useSharedValue(1);
	const resultOpacity = useSharedValue(state === "revealed" ? 1 : 0);
	const resultTranslate = useSharedValue(state === "revealed" ? 0 : 10);
	const [visibleChecks, setVisibleChecks] = useState(state === "revealed" ? 4 : 0);
	const [displayScore, setDisplayScore] = useState(state === "revealed" ? score : 0);
	const radius = 62;
	const size = 150;
	const center = size / 2;
	const strokeWidth = 12;
	const circumference = 2 * Math.PI * radius;
	const isRevealed = state === "revealed";
	const isLoading = state === "loading";
	const ringColor = isRevealed ? gutScoreTint(score) : palette.primary;
	const statusLabel = isRevealed
		? "Starting Gut Score"
		: isLoading
		? "Computing"
		: "Ready to compute";
	const checklistItems = [
		"Symptoms",
		"Conditions",
		"Sensitivities",
		"Current patterns",
	];

	useEffect(() => {
		if (state === "ready") {
			setVisibleChecks(0);
			setDisplayScore(0);
			ringProgress.value = withTiming(0.16, { duration: 240 });
			resultOpacity.value = withTiming(0, { duration: 120 });
			resultTranslate.value = withTiming(10, { duration: 120 });
			ringScale.value = withRepeat(
				withTiming(1.035, {
					duration: 1100,
					easing: Easing.inOut(Easing.quad),
				}),
				-1,
				true
			);
			return;
		}

		if (state === "loading") {
			setDisplayScore(0);
			setVisibleChecks(0);
			ringProgress.value = withTiming(0.92, {
				duration: 2100,
				easing: Easing.out(Easing.cubic),
			});
			ringScale.value = withTiming(1, { duration: 200 });
			resultOpacity.value = withTiming(0, { duration: 120 });
			resultTranslate.value = withTiming(10, { duration: 120 });
			const timers = [320, 760, 1220, 1700].map((delay, index) =>
				setTimeout(() => setVisibleChecks(index + 1), delay)
			);
			return () => timers.forEach(clearTimeout);
		}

		setVisibleChecks(4);
		ringProgress.value = withTiming(Math.max(score / 100, 0.04), {
			duration: 620,
			easing: Easing.out(Easing.cubic),
		});
		ringScale.value = withSequence(
			withTiming(1.035, { duration: 160 }),
			withTiming(1, { duration: 260 })
		);
		resultOpacity.value = withDelay(120, withTiming(1, { duration: 280 }));
		resultTranslate.value = withDelay(120, withTiming(0, { duration: 280 }));

		const startedAt = Date.now();
		const duration = 620;
		const interval = setInterval(() => {
			const elapsed = Date.now() - startedAt;
			const progress = Math.min(elapsed / duration, 1);
			setDisplayScore(Math.round(score * progress));
			if (progress >= 1) {
				clearInterval(interval);
			}
		}, 16);

		return () => clearInterval(interval);
	}, [ringProgress, ringScale, resultOpacity, resultTranslate, score, state]);

	const animatedRingProps = useAnimatedProps(() => ({
		strokeDashoffset: circumference * (1 - ringProgress.value),
	}));

	const ringAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: ringScale.value }],
	}));

	const resultAnimatedStyle = useAnimatedStyle(() => ({
		opacity: resultOpacity.value,
		transform: [{ translateY: resultTranslate.value }],
	}));

	return (
		<Animated.View style={styles.card}>
			<View style={styles.header}>
				<View>
					<Text style={styles.eyebrow}>Gut Score</Text>
					<Text style={styles.title}>
						{isRevealed ? healthTextForScore(score) : "Profile scan"}
					</Text>
				</View>
				<View
					style={[
						styles.statusPill,
						isRevealed ? { backgroundColor: scoreBackground(score) } : null,
					]}
				>
					<Text style={[styles.statusText, isRevealed ? { color: gutScoreTint(score) } : null]}>
						{statusLabel}
					</Text>
				</View>
			</View>

			<Animated.View style={[styles.ringWrap, ringAnimatedStyle]}>
				<Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
					<Circle
						cx={center}
						cy={center}
						r={radius}
						stroke={tokens.color.chart.track}
						strokeWidth={strokeWidth}
						fill="none"
					/>
					<AnimatedCircle
						cx={center}
						cy={center}
						r={radius}
						stroke={ringColor}
						strokeWidth={strokeWidth}
						strokeLinecap="round"
						fill="none"
						strokeDasharray={`${circumference} ${circumference}`}
						animatedProps={animatedRingProps}
						transform={`rotate(-90 ${center} ${center})`}
					/>
				</Svg>
				<View style={styles.center}>
					{isLoading ? (
						<StartingScoreLoadingDots color={ringColor} />
					) : (
						<Text style={[styles.value, { color: ringColor }]}>
							{isRevealed ? String(displayScore) : "--"}
						</Text>
					)}
					<Text style={styles.centerLabel}>{isRevealed ? "out of 100" : "Gut Score"}</Text>
				</View>
			</Animated.View>

			{isRevealed ? null : (
				<View style={styles.checklist}>
					{checklistItems.map((item, index) => {
						const complete = index < visibleChecks;
						return (
							<View key={item} style={styles.checkRow}>
								<View style={[styles.checkIcon, complete ? styles.checkIconComplete : null]}>
									<Ionicons
										name={(complete ? "checkmark" : "ellipse") as IoniconName}
										size={complete ? 14 : 6}
										color={complete ? tokens.color.text.inverse : tokens.color.icon.muted}
									/>
								</View>
								<Text style={[styles.checkText, complete ? styles.checkTextComplete : null]}>
									{item}
								</Text>
							</View>
						);
					})}
				</View>
			)}

			{isRevealed ? (
				<Animated.Image
					source={startingScorePipImage(score)}
					style={[styles.pipImage, resultAnimatedStyle]}
					resizeMode="contain"
					accessibilityIgnoresInvertColors
				/>
			) : null}

			{isRevealed ? (
				<Animated.View style={[styles.resultPanel, resultAnimatedStyle]}>
					<Text style={styles.resultText}>{startingScoreExplanation(score)}</Text>
				</Animated.View>
			) : (
				<Text style={styles.hint}>
					{isLoading
						? "Building your starting point from your profile answers."
						: "Tap below to turn your profile into a starting Gut Score."}
				</Text>
			)}
		</Animated.View>
	);
}

function StartingScoreLoadingDots({ color }: { color: string }) {
	return (
		<View style={styles.dotRow}>
			<StartingScoreLoadingDot color={color} delay={0} />
			<StartingScoreLoadingDot color={color} delay={120} />
			<StartingScoreLoadingDot color={color} delay={240} />
		</View>
	);
}

function StartingScoreLoadingDot({ color, delay }: { color: string; delay: number }) {
	const translateY = useSharedValue(0);
	const opacity = useSharedValue(0.58);

	useEffect(() => {
		translateY.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(-8, { duration: 240, easing: Easing.out(Easing.cubic) }),
					withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) })
				),
				-1,
				false
			)
		);
		opacity.value = withDelay(
			delay,
			withRepeat(
				withSequence(withTiming(1, { duration: 240 }), withTiming(0.58, { duration: 260 })),
				-1,
				false
			)
		);
	}, [delay, opacity, translateY]);

	const dotStyle = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateY: translateY.value }],
	}));

	return <Animated.View style={[styles.loadingDot, { backgroundColor: color }, dotStyle]} />;
}

function scoreBackground(score: number) {
	if (score >= 67) return tokens.color.status.risk.low.background;
	if (score >= 34) return tokens.color.status.risk.medium.background;
	return tokens.color.status.risk.high.background;
}

function healthTextForScore(score: number) {
	if (score >= 67) return "Calm";
	if (score >= 34) return "Mixed";
	return "Reactive";
}

function startingScorePipImage(score: number): ImageSourcePropType {
	if (score >= 67) return PIP_BASE;
	if (score >= 34) return PIP_SUBTLE;
	return PIP_ANXIOUS;
}

function startingScoreExplanation(score: number) {
	if (score >= 67) {
		return "Pretty decent. You are only having mild issues and we can help with that quickly.";
	}

	if (score >= 34) {
		return "Not bad. You are having some stomach issues we'll clean up in no time.";
	}

	return "Your gut is very reactive. Don't stress, we'll raise your score in no time.";
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		maxWidth: 360,
		alignSelf: "center",
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		borderRadius: 30,
		backgroundColor: tokens.color.surface.card.default,
		padding: spacing.md,
		alignItems: "center",
		gap: spacing.md,
		...tokens.shadow.card,
	},
	header: {
		width: "100%",
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	eyebrow: {
		color: palette.primary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
	},
	title: {
		color: tokens.color.text.primary,
		fontFamily: type.body.bold,
		fontSize: 20,
		lineHeight: 24,
	},
	statusPill: {
		minHeight: 30,
		borderRadius: 15,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	statusText: {
		color: tokens.color.status.success.foreground,
		fontFamily: type.body.bold,
		fontSize: 12,
		lineHeight: 16,
	},
	ringWrap: {
		width: 150,
		height: 150,
		alignItems: "center",
		justifyContent: "center",
	},
	center: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	value: {
		fontFamily: type.body.bold,
		fontSize: 46,
		lineHeight: 52,
		letterSpacing: -1.5,
		fontVariant: ["tabular-nums"],
	},
	dotRow: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	loadingDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	centerLabel: {
		color: tokens.color.text.tertiary,
		fontFamily: type.body.semibold,
		fontSize: 12,
		lineHeight: 16,
		textTransform: "uppercase",
	},
	checklist: {
		width: "100%",
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.xs,
	},
	checkRow: {
		width: "48%",
		height: 44,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: 22,
		backgroundColor: tokens.color.surface.card.default,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.xs,
	},
	checkIcon: {
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: tokens.color.chart.track,
		alignItems: "center",
		justifyContent: "center",
	},
	checkIconComplete: {
		backgroundColor: palette.primary,
	},
	checkText: {
		flex: 1,
		color: tokens.color.text.secondary,
		fontFamily: type.body.semibold,
		fontSize: 11,
		lineHeight: 14,
	},
	checkTextComplete: {
		color: tokens.color.text.primary,
	},
	hint: {
		color: tokens.color.text.secondary,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
		textAlign: "center",
	},
	pipImage: {
		width: 112,
		height: 112,
		marginTop: -spacing.xs,
		marginBottom: -spacing.xs,
	},
	resultPanel: {
		width: "100%",
		borderRadius: 20,
		backgroundColor: tokens.color.status.success.background,
		padding: spacing.md,
	},
	resultText: {
		color: tokens.color.text.primary,
		fontFamily: type.body.medium,
		fontSize: 14,
		lineHeight: 21,
		textAlign: "center",
	},
});

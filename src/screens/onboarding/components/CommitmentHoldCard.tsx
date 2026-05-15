import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	SharedValue,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
} from "react-native-reanimated";

import { Pip } from "../../../components/common/Pip";
import { palette, spacing, tokens, type } from "../../../theme";
import { onboardingMotion } from "./motion";

type CommitmentHoldCardProps = {
	onCommitted: () => void;
};

const HOLD_DURATION_MS = 1500;
const CONFETTI_COLORS = [
	tokens.color.accent.brand,
	tokens.color.status.risk.medium.tint,
	tokens.color.status.risk.high.tint,
	tokens.color.info.tint,
	tokens.color.accent.mascot,
];

export function CommitmentHoldCard({ onCommitted }: CommitmentHoldCardProps) {
	const [committed, setCommitted] = useState(false);
	const scale = useSharedValue(1);
	const ringProgress = useSharedValue(0);
	const confettiProgress = useSharedValue(0);
	const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const particles = useMemo(
		() =>
			Array.from({ length: 18 }, (_, index) => ({
				id: `particle-${index}`,
				color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? palette.primary,
				angle: -160 + index * 18,
				distance: 70 + (index % 4) * 15,
				size: 7 + (index % 3) * 2,
				delay: (index % 5) * 28,
			})),
		[]
	);

	useEffect(() => {
		return () => {
			clearHoldTimer();
			if (advanceTimerRef.current) {
				clearTimeout(advanceTimerRef.current);
			}
		};
	}, []);

	function clearHoldTimer() {
		if (holdTimerRef.current) {
			clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		}
	}

	function handlePressIn() {
		if (committed) {
			return;
		}

		void Haptics.selectionAsync();
		ringProgress.value = 0;
		ringProgress.value = withTiming(1, {
			duration: HOLD_DURATION_MS,
			easing: Easing.inOut(Easing.cubic),
		});
		scale.value = withTiming(1.62, {
			duration: HOLD_DURATION_MS,
			easing: Easing.inOut(Easing.cubic),
		});
		clearHoldTimer();
		holdTimerRef.current = setTimeout(finishCommitment, HOLD_DURATION_MS);
	}

	function handlePressOut() {
		if (committed) {
			return;
		}

		clearHoldTimer();
		ringProgress.value = withTiming(0, onboardingMotion.timing.quick);
		scale.value = withSpring(1, onboardingMotion.spring.release);
	}

	function finishCommitment() {
		if (committed) {
			return;
		}

		setCommitted(true);
		void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
		scale.value = withSequence(
			withSpring(1.78, onboardingMotion.spring.pop),
			withSpring(1.42, onboardingMotion.spring.release)
		);
		ringProgress.value = withTiming(1, onboardingMotion.timing.quick);
		confettiProgress.value = 0;
		confettiProgress.value = withTiming(1, {
			duration: 850,
			easing: Easing.out(Easing.cubic),
		});
		advanceTimerRef.current = setTimeout(onCommitted, 1050);
	}

	const pipStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	const ringStyle = useAnimatedStyle(() => ({
		opacity: 0.24 + ringProgress.value * 0.46,
		transform: [{ scale: 0.82 + ringProgress.value * 0.42 }],
	}));

	return (
		<View style={styles.card}>
			<View style={styles.commitmentStage}>
				<Animated.View style={[styles.commitRing, ringStyle]} />
				{particles.map((particle) => (
					<ConfettiParticle
						key={particle.id}
						color={particle.color}
						angle={particle.angle}
						distance={particle.distance}
						size={particle.size}
						delay={particle.delay}
						progress={confettiProgress}
					/>
				))}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Press and hold Pip to commit"
					onPressIn={handlePressIn}
					onPressOut={handlePressOut}
					style={styles.pipButton}
				>
					<Animated.View style={pipStyle}>
						<Pip state={committed ? "joy" : "love"} size={132} />
					</Animated.View>
				</Pressable>
			</View>
			<View style={styles.instructionRow}>
				<Ionicons
					name={committed ? "checkmark-circle" : "hand-left-outline"}
					size={20}
					color={palette.primary}
				/>
				<Text style={styles.instructionText}>
					{committed ? "Committed." : "Press and hold Pip to commit."}
				</Text>
			</View>
		</View>
	);
}

function ConfettiParticle({
	color,
	angle,
	distance,
	size,
	delay,
	progress,
}: {
	color: string;
	angle: number;
	distance: number;
	size: number;
	delay: number;
	progress: SharedValue<number>;
}) {
	const particleStyle = useAnimatedStyle(() => {
		const localProgress = Math.max(0, Math.min(1, (progress.value * 850 - delay) / 650));
		const radians = (angle * Math.PI) / 180;
		const easedDistance = distance * localProgress;
		return {
			opacity: localProgress > 0 ? 1 - localProgress * 0.15 : 0,
			transform: [
				{ translateX: Math.cos(radians) * easedDistance },
				{ translateY: Math.sin(radians) * easedDistance },
				{ rotate: `${angle + localProgress * 160}deg` },
				{ scale: localProgress > 0 ? 1 : 0.3 },
			],
		};
	});

	return (
		<Animated.View
			style={[
				styles.confetti,
				{
					width: size,
					height: size * 1.55,
					borderRadius: size / 2,
					backgroundColor: color,
				},
				{ transform: [{ translateY: 0 }] },
				particleStyle,
			]}
		/>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		alignItems: "center",
		gap: spacing.lg,
		paddingVertical: spacing.lg,
	},
	commitmentStage: {
		width: 250,
		height: 250,
		alignItems: "center",
		justifyContent: "center",
	},
	commitRing: {
		position: "absolute",
		width: 174,
		height: 174,
		borderRadius: 87,
		borderWidth: 2,
		borderColor: palette.primary,
		backgroundColor: tokens.color.status.success.background,
	},
	pipButton: {
		width: 180,
		height: 180,
		alignItems: "center",
		justifyContent: "center",
	},
	confetti: {
		position: "absolute",
		left: 121,
		top: 121,
	},
	instructionRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		borderRadius: 999,
		backgroundColor: tokens.color.status.success.background,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
	},
	instructionText: {
		color: palette.primaryDark,
		fontFamily: type.body.semibold,
		fontSize: 15,
		lineHeight: 20,
	},
});

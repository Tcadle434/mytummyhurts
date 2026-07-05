import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { VideoView, useVideoPlayer } from "expo-video";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pip } from "../../components/common/Pip";
import { OnboardingStackParamList } from "../../navigation/types";
import { trackEvent } from "../../services/analytics";
import { useAppStore } from "../../store/useAppStore";
import { radii, spacing, tokens } from "../../theme";
import { withAlpha } from "../../theme/helpers";

type Props = NativeStackScreenProps<OnboardingStackParamList, "GetStarted">;

const BACKGROUND_VIDEO = require("../../../assets/get_started_background_video.mp4");
const TEXT_LOGO = require("../../../assets/mth_text_logo.png");

export function GetStartedScreen({ navigation }: Props) {
	const insets = useSafeAreaInsets();
	const setOnboardingStage = useAppStore((state) => state.setOnboardingStage);
	const player = useVideoPlayer(BACKGROUND_VIDEO, (videoPlayer) => {
		videoPlayer.loop = true;
		videoPlayer.muted = true;
		videoPlayer.audioMixingMode = "mixWithOthers";
		videoPlayer.play();
	});

	function handleGetStarted() {
		trackEvent("get_started_pressed");
		setOnboardingStage("flow");
		navigation.replace("OnboardingFlow");
	}

	function handleSignIn() {
		trackEvent("existing_account_sign_in_pressed");
		navigation.navigate("OnboardingSignIn");
	}

	return (
		<View style={styles.screen}>
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				nativeControls={false}
				playsInline
				allowsPictureInPicture={false}
				fullscreenOptions={{ enable: false }}
			/>
			<View style={styles.scrim} />

			<View
				style={[
					styles.content,
					{
						paddingTop: insets.top + spacing.xl,
						paddingBottom: insets.bottom + spacing.xl,
					},
				]}
			>
				<View style={styles.heroGroup}>
					<View style={styles.pipWrap}>
						<Pip state="waving" size={218} accessibilityLabel="Pip waving" />
					</View>
					<Image
						source={TEXT_LOGO}
						style={styles.logo}
						resizeMode="contain"
						accessible
						accessibilityRole="image"
						accessibilityLabel="MyTummyHurts"
					/>
				</View>

				<View style={styles.actionGroup}>
					<Pressable
						accessibilityRole="button"
						onPress={handleGetStarted}
						style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
					>
						<Text style={styles.buttonLabel}>Get started</Text>
						<Ionicons
							name="arrow-forward"
							size={19}
							color={tokens.color.action.primary.foreground}
						/>
					</Pressable>

					<Pressable
						accessibilityRole="button"
						onPress={handleSignIn}
						style={({ pressed }) => [styles.signInLink, pressed && { opacity: 0.72 }]}
					>
						<Text style={styles.signInText}>
							Already have an account? <Text style={styles.signInTextStrong}>Sign in</Text>
						</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: tokens.color.surface.app.default,
		overflow: "hidden",
	},
	scrim: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: withAlpha(tokens.color.text.primary, 0.1),
	},
	content: {
		flex: 1,
		alignItems: "center",
		justifyContent: "flex-end",
		paddingHorizontal: spacing.xl,
		gap: spacing.xxxl,
	},
	heroGroup: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.md,
		marginBottom: "auto",
		paddingTop: spacing.xxxl,
	},
	logo: {
		width: 230,
		height: 48,
		shadowColor: tokens.color.utility.white,
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.82,
		shadowRadius: 10,
	},
	pipWrap: {
		alignItems: "center",
		justifyContent: "center",
		width: 250,
		height: 250,
	},
	actionGroup: {
		width: "100%",
		alignItems: "center",
		gap: spacing.md,
	},
	button: {
		width: "100%",
		minHeight: 58,
		flexDirection: "row",
		gap: spacing.xs,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.pill,
		backgroundColor: tokens.color.action.primary.background,
	},
	buttonPressed: {
		opacity: 0.9,
		transform: [{ scale: 0.99 }],
	},
	buttonLabel: {
		...tokens.type.label.button,
		color: tokens.color.action.primary.foreground,
	},
	signInLink: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs,
	},
	signInText: {
		...tokens.type.body.small,
		color: tokens.color.utility.white,
		textAlign: "center",
		textShadowColor: withAlpha(tokens.color.text.primary, 0.38),
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 8,
	},
	signInTextStrong: {
		fontFamily: tokens.type.label.button.fontFamily,
	},
});

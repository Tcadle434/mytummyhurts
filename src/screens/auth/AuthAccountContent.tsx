import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Pip } from "../../components/common/Pip";
import {
	AppScreen,
	InfoPill,
	InputField,
	PrimaryButton,
	SectionCard,
} from "../../components/common/UI";
import { palette, radii, spacing, tokens, type } from "../../theme";

type AuthAccountContentProps = {
	email: string;
	password: string;
	busy: boolean;
	busyMessage: string;
	errorMessage: string | null;
	emailMode: "signIn" | "signUp";
	providerSlot: ReactNode;
	eyebrow?: string;
	title?: string;
	subtitle?: string;
	backAccessibilityLabel?: string;
	showModeToggle?: boolean;
	onBack: () => void;
	onEmailChange: (value: string) => void;
	onPasswordChange: (value: string) => void;
	onSignIn: () => void;
	onCreateAccount: () => void;
	onToggleEmailMode: () => void;
};

export function AuthAccountContent({
	email,
	password,
	busy,
	busyMessage,
	errorMessage,
	emailMode,
	providerSlot,
	eyebrow = "Account creation",
	title = "Create your account",
	subtitle = "Save your profile, scans, reports, and gut insights.",
	backAccessibilityLabel = "Go back",
	showModeToggle = true,
	onBack,
	onEmailChange,
	onPasswordChange,
	onSignIn,
	onCreateAccount,
	onToggleEmailMode,
}: AuthAccountContentProps) {
	const isSignInMode = emailMode === "signIn";

	return (
		<AppScreen contentContainerStyle={styles.screenContent}>
			<View style={styles.root}>
				<View style={styles.headerRow}>
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={backAccessibilityLabel}
						onPress={onBack}
						hitSlop={8}
						style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.72 }]}
					>
						<Ionicons name="chevron-back" size={24} color={palette.primary} />
					</Pressable>
					<View style={styles.headerSpacer} />
				</View>

				<View style={styles.hero}>
					<Pip state="thumbsUp" size={94} />
					<View style={styles.heroCopy}>
						<Text style={styles.eyebrow}>{eyebrow}</Text>
						<Text style={styles.title}>{title}</Text>
						<Text style={styles.subtitle}>{subtitle}</Text>
					</View>
				</View>

				<View style={styles.stack}>
					<SectionCard style={styles.providerCard}>{providerSlot}</SectionCard>

					<SectionCard style={styles.emailCard}>
						<Text style={styles.cardTitle}>Email and password</Text>
						<InputField
							value={email}
							placeholder="you@example.com"
							onChangeText={onEmailChange}
							autoCapitalize="none"
							autoComplete="email"
							keyboardType="email-address"
							textContentType="emailAddress"
						/>
						<InputField
							value={password}
							placeholder="Password"
							onChangeText={onPasswordChange}
							autoCapitalize="none"
							autoComplete="password"
							secureTextEntry
							textContentType="password"
						/>
						<PrimaryButton
							label={
								busy
									? isSignInMode
										? "Signing in..."
										: "Creating account..."
									: isSignInMode
									? "Sign in"
									: "Create account"
							}
							onPress={isSignInMode ? onSignIn : onCreateAccount}
							disabled={busy}
						/>
						{showModeToggle ? (
							<Pressable
								accessibilityRole="button"
								onPress={onToggleEmailMode}
								disabled={busy}
								style={({ pressed }) => [
									styles.modeToggle,
									pressed && !busy && { opacity: 0.72 },
									busy && { opacity: 0.5 },
								]}
							>
								<Text style={styles.modeToggleText}>
									{isSignInMode
										? "Need an account? Create one"
										: "Already have an account? Sign in"}
								</Text>
							</Pressable>
						) : null}
						{busy ? (
							<View style={styles.feedbackRow}>
								<ActivityIndicator color={palette.primary} />
								<Text style={styles.feedbackText}>Working on {busyMessage}...</Text>
							</View>
						) : null}
						{errorMessage ? <InfoPill label={errorMessage} tone="warm" /> : null}
					</SectionCard>
				</View>
			</View>
		</AppScreen>
	);
}

export function AuthProviderButton({
	label,
	onPress,
	disabled,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	return (
		<Pressable
			accessibilityRole="button"
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.providerButton,
				disabled && { opacity: 0.5 },
				pressed && !disabled && { opacity: 0.88 },
			]}
		>
			<Ionicons name="logo-google" size={20} color={tokens.color.text.primary} />
			<Text style={styles.providerButtonLabel}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	screenContent: {
		paddingBottom: spacing.lg,
		gap: 0,
	},
	root: {
		flex: 1,
		width: "100%",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	headerSpacer: {
		width: 40,
		height: 40,
	},
	backButton: {
		width: 40,
		height: 40,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: tokens.color.status.success.background,
	},
	hero: {
		alignItems: "center",
		gap: spacing.xs,
	},
	heroCopy: {
		alignItems: "center",
		gap: 3,
	},
	eyebrow: {
		...tokens.type.label.eyebrow,
		color: tokens.color.text.tertiary,
	},
	title: {
		...tokens.type.title.screen,
		color: tokens.color.text.primary,
		textAlign: "center",
	},
	subtitle: {
		...tokens.type.body.default,
		color: tokens.color.text.tertiary,
		textAlign: "center",
		maxWidth: 290,
	},
	stack: {
		gap: spacing.sm,
	},
	providerCard: {
		padding: spacing.md,
		gap: spacing.sm,
	},
	providerButton: {
		minHeight: 54,
		borderRadius: radii.pill,
		backgroundColor: tokens.color.action.secondary.background,
		borderWidth: 1,
		borderColor: tokens.color.border.subtle,
		paddingHorizontal: spacing.lg,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	providerButtonLabel: {
		...tokens.type.label.button,
		color: tokens.color.action.secondary.foreground,
	},
	emailCard: {
		padding: spacing.md,
		gap: spacing.sm,
	},
	cardTitle: {
		color: palette.text,
		fontFamily: type.body.bold,
		fontSize: 15,
		lineHeight: 20,
	},
	modeToggle: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xs,
	},
	modeToggleText: {
		color: palette.primaryDark,
		fontFamily: type.body.semibold,
		fontSize: 13,
		lineHeight: 18,
	},
	feedbackRow: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "center",
		gap: spacing.sm,
	},
	feedbackText: {
		color: palette.textMuted,
		fontFamily: type.body.medium,
		fontSize: 13,
		lineHeight: 18,
	},
});

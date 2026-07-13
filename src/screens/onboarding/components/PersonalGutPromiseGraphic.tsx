import { StyleSheet, View } from "react-native";

import { Pip } from "../../../components/common/Pip";
import { spacing, tokens } from "../../../theme";

export function PersonalGutPromiseGraphic() {
	return (
		<View style={styles.wrap}>
			<View style={styles.auraOuter} />
			<View style={styles.auraInner} />
			<Pip state="love" size={220} />
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.lg,
	},
	auraOuter: {
		position: "absolute",
		width: 300,
		height: 300,
		borderRadius: 150,
		backgroundColor: tokens.color.surface.card.success,
		opacity: 0.55,
	},
	auraInner: {
		position: "absolute",
		width: 230,
		height: 230,
		borderRadius: 115,
		backgroundColor: tokens.color.surface.card.success,
		opacity: 0.9,
	},
});

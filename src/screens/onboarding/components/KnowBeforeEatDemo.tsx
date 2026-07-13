import { KnowBeforeEatResultView } from "./KnowBeforeEatResultViews";
import { AnalyzingView, ScannerImageView } from "./KnowBeforeEatScanningViews";

export type KnowBeforeEatStage =
	| "menu-scan"
	| "menu-loading"
	| "menu-result"
	| "food-scan"
	| "food-loading"
	| "food-result"
	| "barcode-scan"
	| "barcode-loading"
	| "barcode-result";

const MENU_IMAGE = require("../../../../assets/ui/menu_scanning_onboarding.png");
const MEAL_IMAGE = require("../../../../assets/ui/meal_scanning_onboarding.png");
const BARCODE_IMAGE = require("../../../../assets/ui/barcode_scanning_onboarding.png");

type Props = {
	stage: KnowBeforeEatStage;
	imageHeight: number;
};

export function KnowBeforeEatDemo({ stage, imageHeight }: Props) {
	switch (stage) {
		case "menu-scan":
			return (
				<ScannerImageView
					source={MENU_IMAGE}
					imageHeight={imageHeight}
					headline="Scan a menu"
				/>
			);
		case "menu-loading":
			return <AnalyzingView label="Analyzing menu…" />;
		case "menu-result":
			return <KnowBeforeEatResultView kind="menu" />;
		case "food-scan":
			return (
				<ScannerImageView
					source={MEAL_IMAGE}
					imageHeight={imageHeight}
					headline="Scan your meal"
				/>
			);
		case "food-loading":
			return <AnalyzingView label="Analyzing your meal…" />;
		case "food-result":
			return <KnowBeforeEatResultView kind="food" />;
		case "barcode-scan":
			return (
				<ScannerImageView
					source={BARCODE_IMAGE}
					imageHeight={imageHeight}
					headline="Scan a grocery item"
				/>
			);
		case "barcode-loading":
			return <AnalyzingView label="Reading ingredient list…" />;
		case "barcode-result":
			return <KnowBeforeEatResultView kind="barcode" />;
		default:
			return null;
	}
}

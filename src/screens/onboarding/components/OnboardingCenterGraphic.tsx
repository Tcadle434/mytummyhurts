import { WeeklyProgressCard } from "../../../components/progress/WeeklyProgressCard";
import {
	createMockFeaturedDailyScoreDay,
	createMockWeeklyProgressDays,
} from "../../../utils/weeklyProgress";
import {
	PhaseDiscoveryGraphic,
	type PhaseDiscoveryState,
} from "./PhaseDiscoveryGraphic";
import {
	FoodControlIntroGraphic,
	FoodLeverComparisonGraphic,
} from "./FoodControlGraphics";
import { GutScoreScaleGraphic } from "./GutScoreScaleGraphic";
import { EmpathyProblemGraphic } from "./EmpathyProblemGraphic";
import { HealingLoopDiagram } from "./HealingLoopDiagram";
import { HealingPromiseGraphic } from "./HealingPromiseGraphic";
import {
	PhaseLimitationGraphic,
	PhaseReintroductionGraphic,
} from "./PhasePlanGraphics";
import { PersonalGutPromiseGraphic } from "./PersonalGutPromiseGraphic";
import { ScannerModesOverviewGraphic } from "./ScannerModesOverviewGraphic";

type OnboardingCenterGraphicProps = {
	centerGraphic?: string;
	phaseDiscoveryState?: PhaseDiscoveryState;
};

/**
 * Routes onboarding `centerGraphic` keys to focused graphic components. This
 * keeps the screen controller from owning illustration composition.
 */
export function OnboardingCenterGraphic({
	centerGraphic,
	phaseDiscoveryState = "scan",
}: OnboardingCenterGraphicProps) {
	switch (centerGraphic) {
		case "empathyProblem":
			return <EmpathyProblemGraphic />;
		case "healingPromise":
			return <HealingPromiseGraphic />;
		case "gutScoreScale":
			return <GutScoreScaleGraphic />;
		case "dailyScoreCard": {
			const mockDays = createMockWeeklyProgressDays();
			return (
				<WeeklyProgressCard
					days={mockDays}
					mode="preview"
					showChevron={false}
					featuredDay={createMockFeaturedDailyScoreDay()}
					featuredLabel="Yesterday"
				/>
			);
		}
		case "healingLoopDiagram":
			return <HealingLoopDiagram />;
		case "phaseDiscovery":
			return <PhaseDiscoveryGraphic state={phaseDiscoveryState} />;
		case "phaseLimitation":
			return <PhaseLimitationGraphic />;
		case "phaseReintroduction":
			return <PhaseReintroductionGraphic />;
		case "scannerModesOverview":
			return <ScannerModesOverviewGraphic />;
		case "foodControlIntro":
			return <FoodControlIntroGraphic />;
		case "foodLeverComparison":
			return <FoodLeverComparisonGraphic />;
		case "personalGutPromise":
			return <PersonalGutPromiseGraphic />;
		default:
			return null;
	}
}

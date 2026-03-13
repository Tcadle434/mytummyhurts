import { useAppStore } from '../../store/useAppStore';
import {
  AnalyzeImageRequest,
  AnalyzeResponse,
  AnalyzeTextRequest,
  HistoryResponse,
  InsightsResponse,
  MealResponseRequest,
  MealSymptomsRequest,
} from './contracts';

export const mockApiClient = {
  async analyzeImage(request: AnalyzeImageRequest): Promise<AnalyzeResponse> {
    const result = await useAppStore.getState().analyzeScanInput({
      sourceType: request.sourceType,
      imageUri: request.imagePath,
    });
    const state = useAppStore.getState();
    const scan = state.scans.find((entry) => entry.id === result.scanId)!;
    const meal = state.meals.find((entry) => entry.id === result.mealId)!;
    return {
      scanId: result.scanId,
      mealId: result.mealId,
      tokensRemaining: state.billing.tokensRemaining,
      scan,
      meal,
      billing: state.billing,
    };
  },

  async analyzeText(request: AnalyzeTextRequest): Promise<AnalyzeResponse> {
    const result = await useAppStore.getState().analyzeScanInput({
      sourceType: request.sourceType,
      text: request.text,
    });
    const state = useAppStore.getState();
    const scan = state.scans.find((entry) => entry.id === result.scanId)!;
    const meal = state.meals.find((entry) => entry.id === result.mealId)!;
    return {
      scanId: result.scanId,
      mealId: result.mealId,
      tokensRemaining: state.billing.tokensRemaining,
      scan,
      meal,
      billing: state.billing,
    };
  },

  async respondEaten(request: MealResponseRequest) {
    await useAppStore.getState().setFollowupState(request.mealId, request.didUserEat);
    const meal = useAppStore.getState().meals.find((entry) => entry.id === request.mealId)!;
    return { ok: true as const, meal };
  },

  async logSymptoms(request: MealSymptomsRequest) {
    await useAppStore.getState().submitSymptoms(request);
    const state = useAppStore.getState();
    const meal = state.meals.find((entry) => entry.id === request.mealId)!;
    return {
      ok: true as const,
      meal,
      profile: state.profile,
      insights: state.insights,
    };
  },

  async getHistory(): Promise<HistoryResponse> {
    const state = useAppStore.getState();
    return {
      page: 1,
      pageSize: state.meals.length,
      hasMore: false,
      pendingMeals: state.meals.filter((entry) => entry.followupState === 'pending'),
      recentMeals: state.meals.filter((entry) => entry.followupState !== 'pending'),
      scans: state.scans,
    };
  },

  async getInsights(): Promise<InsightsResponse> {
    const state = useAppStore.getState();
    return {
      profile: state.profile,
      insights: state.insights,
      billing: state.billing,
    };
  },
};

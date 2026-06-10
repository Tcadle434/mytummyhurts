import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { refreshUserAppSnapshot } from "../_shared/appSnapshot.ts";
import {
  ensureUserRow,
  getBillingState,
  getConditionIngredientInsights,
  getInsights,
  getProfile,
  replaceUserDietPreferences,
} from "../_shared/db.ts";
import { requireEntitledUser } from "../_shared/entitlements.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { enqueueLearningJob } from "../_shared/learningJobs.ts";
import { errorMetadata, recordSystemEvent } from "../_shared/observability.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";
import {
  dietPreferenceLabels,
  normalizeDietPreferenceKey,
  normalizeDietPreferences,
} from "../_shared/dietRubric.ts";

type ProfileUpdateBody = {
  onboardingAnswers?: {
    displayName?: string | null;
    conditions?: string[];
    customConditions?: string[];
    ingredientSensitivities?: string[];
    customIngredientSensitivities?: string[];
    symptoms?: string[];
    customSymptoms?: string[];
    symptomFrequency?: string;
    symptomSeverityBaseline?: string;
    mealContexts?: string[];
    motivation?: string;
    currentEatingPatterns?: string[];
    lifestyleFactors?: string[];
    favoriteFoodsToReintroduce?: string;
    dietPreferenceKeys?: string[];
  };
  displayName?: string | null;
  knownConditions?: string[];
  knownIngredientSensitivities?: string[];
  commonSymptoms?: string[];
  symptomFrequency?: string;
  symptomSeverityBaseline?: string;
  mealContexts?: string[];
  motivation?: string;
  currentEatingPatterns?: string[];
  lifestyleFactors?: string[];
  foodsToReintroduce?: string[];
  dietPreferences?: Array<
    {
      key?: string;
      dietKey?: string;
      label?: string;
      strictness?: string;
      source?: string;
    }
  >;
};

const profileUpdateFieldKeys: Array<
  keyof Omit<ProfileUpdateBody, "displayName" | "onboardingAnswers">
> = [
  "knownConditions",
  "knownIngredientSensitivities",
  "commonSymptoms",
  "symptomFrequency",
  "symptomSeverityBaseline",
  "mealContexts",
  "motivation",
  "currentEatingPatterns",
  "lifestyleFactors",
  "foodsToReintroduce",
  "dietPreferences",
];

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasOwnKey<T extends object>(value: T, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isDisplayNameOnlyUpdate(body: ProfileUpdateBody) {
  return (
    !body.onboardingAnswers &&
    hasOwnKey(body, "displayName") &&
    profileUpdateFieldKeys.every((key) => !hasOwnKey(body, key))
  );
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, "method_not_allowed");
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<ProfileUpdateBody>(request);

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);

    if (isDisplayNameOnlyUpdate(body)) {
      const displayName = normalizeOptionalText(body.displayName);
      const { error: displayNameError } = await admin.from("user_profiles")
        .upsert(
          {
            user_id: user.id,
            display_name: displayName,
          },
          { onConflict: "user_id" },
        );

      if (displayNameError) {
        throw displayNameError;
      }

      try {
        await refreshUserAppSnapshot(admin, user.id, {
          sourceType: "profile",
          learningStatus: "idle",
        });
      } catch (error) {
        await recordSystemEvent(admin, {
          eventType: "profile_snapshot_refresh_failed",
          severity: "error",
          userId: user.id,
          operation: "profile_update",
          entityType: "profile",
          metadata: errorMetadata(error),
        });
      }

      return jsonResponse({
        ok: true,
        displayName,
        learningSyncStatus: "skipped",
      });
    }

    const { data: existingRow, error: existingError } = await admin
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existingError) {
      throw existingError;
    }

    const onboardingAnswers = body.onboardingAnswers;
    const knownConditions = onboardingAnswers
      ? unique([
        ...(onboardingAnswers.conditions ?? []),
        ...(onboardingAnswers.customConditions ?? []),
      ])
      : unique(body.knownConditions ?? existingRow.known_conditions ?? []);
    const knownIngredientSensitivities = onboardingAnswers
      ? unique([
        ...(onboardingAnswers.ingredientSensitivities ?? []),
        ...(onboardingAnswers.customIngredientSensitivities ?? []),
      ])
      : unique(
        body.knownIngredientSensitivities ??
          existingRow.known_ingredient_sensitivities ?? [],
      );
    const commonSymptoms = onboardingAnswers
      ? unique([
        ...(onboardingAnswers.symptoms ?? []),
        ...(onboardingAnswers.customSymptoms ?? []),
      ])
      : unique(body.commonSymptoms ?? existingRow.common_symptoms ?? []);
    const mealContexts = onboardingAnswers
      ? unique(onboardingAnswers.mealContexts ?? [])
      : unique(body.mealContexts ?? existingRow.meal_contexts ?? []);
    const currentEatingPatterns = onboardingAnswers
      ? unique(onboardingAnswers.currentEatingPatterns ?? [])
      : unique(
        body.currentEatingPatterns ?? existingRow.current_eating_patterns ?? [],
      );
    const lifestyleFactors = onboardingAnswers
      ? unique(onboardingAnswers.lifestyleFactors ?? [])
      : unique(body.lifestyleFactors ?? existingRow.lifestyle_factors ?? []);
    const foodsToReintroduce = onboardingAnswers
      ? unique(
        String(onboardingAnswers.favoriteFoodsToReintroduce ?? "").split(
          /[\n,]/,
        ),
      )
      : unique(
        body.foodsToReintroduce ?? existingRow.foods_to_reintroduce ?? [],
      );
    const dietPreferences = onboardingAnswers
      ? normalizeDietPreferences(
        (onboardingAnswers.dietPreferenceKeys ?? [])
          .map((entry) => normalizeDietPreferenceKey(entry))
          .filter((
            entry,
          ): entry is NonNullable<
            ReturnType<typeof normalizeDietPreferenceKey>
          > => Boolean(entry))
          .map((key) => ({
            key,
            label: dietPreferenceLabels[key],
            strictness: "standard",
            source: "onboarding",
          })),
      )
      : typeof body.dietPreferences === "undefined"
      ? null
      : normalizeDietPreferences(body.dietPreferences);
    const displayName = onboardingAnswers
      ? normalizeOptionalText(onboardingAnswers.displayName)
      : normalizeOptionalText(
        body.displayName ?? existingRow.display_name ?? null,
      );

    const { error: upsertError } = await admin.from("user_profiles").upsert(
      {
        user_id: user.id,
        display_name: displayName,
        known_conditions: knownConditions,
        known_ingredient_sensitivities: knownIngredientSensitivities,
        common_symptoms: commonSymptoms,
        symptom_frequency: onboardingAnswers?.symptomFrequency ??
          body.symptomFrequency ?? existingRow.symptom_frequency ?? null,
        symptom_severity_baseline: onboardingAnswers?.symptomSeverityBaseline ??
          body.symptomSeverityBaseline ??
          existingRow.symptom_severity_baseline ??
          null,
        meal_contexts: mealContexts,
        motivation: onboardingAnswers?.motivation ?? body.motivation ??
          existingRow.motivation ?? null,
        current_eating_patterns: currentEatingPatterns,
        lifestyle_factors: lifestyleFactors,
        foods_to_reintroduce: foodsToReintroduce,
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      throw upsertError;
    }

    if (dietPreferences) {
      await replaceUserDietPreferences(admin, user.id, dietPreferences);
    }

    if (foodsToReintroduce.length > 0) {
      const { data: existingTrials, error: trialLookupError } = await admin
        .from("reintroduction_trials")
        .select("target_food, ingredient_name")
        .eq("user_id", user.id);

      if (trialLookupError) {
        throw trialLookupError;
      }

      const existingTrialKeys = new Set(
        (existingTrials ?? []).map((trial) =>
          normalizeOptionalText(trial.target_food ?? trial.ingredient_name) ??
            ""
        ),
      );
      const newTrials = foodsToReintroduce
        .filter((food) => !existingTrialKeys.has(food))
        .map((food) => ({
          user_id: user.id,
          ingredient_name: food,
          target_food: food,
          status: "planned",
        }));

      if (newTrials.length > 0) {
        const { error: trialInsertError } = await admin.from(
          "reintroduction_trials",
        ).insert(newTrials);
        if (trialInsertError) {
          throw trialInsertError;
        }
      }
    }

    let learningSyncStatus: "queued" | "failed" = "queued";
    try {
      await enqueueLearningJob(admin, {
        userId: user.id,
        eventType: onboardingAnswers
          ? "onboarding_profile_created"
          : "profile_updated",
        sourceType: "profile",
      });
    } catch (error) {
      learningSyncStatus = "failed";
      await recordSystemEvent(admin, {
        eventType: "profile_learning_job_enqueue_failed",
        severity: "error",
        userId: user.id,
        operation: "profile_update",
        entityType: "profile",
        metadata: errorMetadata(error),
      });
    }

    try {
      await refreshUserAppSnapshot(admin, user.id, {
        sourceType: "profile",
        learningStatus: learningSyncStatus === "queued" ? "pending" : "failed",
      });
    } catch (error) {
      await recordSystemEvent(admin, {
        eventType: "profile_snapshot_refresh_failed",
        severity: "error",
        userId: user.id,
        operation: "profile_update",
        entityType: "profile",
        metadata: errorMetadata(error),
      });
    }

    const [insights, conditionInsights, billing] = await Promise.all([
      getInsights(admin, user.id),
      getConditionIngredientInsights(admin, user.id),
      getBillingState(admin, user.id),
    ]);
    const profile = await getProfile(admin, user.id, { insights });

    return jsonResponse({
      ok: true,
      profile,
      insights,
      conditionInsights,
      billing,
      learningSyncStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[profile-update]", error);
    return errorResponse(
      "Profile changes could not be saved.",
      500,
      "profile_update_failed",
    );
  }
});

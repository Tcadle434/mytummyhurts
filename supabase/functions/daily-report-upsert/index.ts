import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { updateUserAppSnapshotDailyReport } from "../_shared/appSnapshot.ts";
import { ensureUserRow, mapDailyReportRow } from "../_shared/db.ts";
import { requireEntitledUser } from "../_shared/entitlements.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import {
  enqueueLearningJob,
  processDueLearningJobs,
} from "../_shared/learningJobs.ts";
import { errorMetadata, recordSystemEvent } from "../_shared/observability.ts";
import { computeDailyScoreForReport } from "../_shared/scoring.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";
import type { ScanForInsightRecompute } from "../_shared/domain.ts";

function waitUntilBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (backgroundPromise: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return;
  }

  void promise;
}

async function processLearningJobsInBackground(userId: string) {
  try {
    const result = await processDueLearningJobs(createAdminClient(), {
      limit: 5,
      workerId: `daily-report-upsert:${crypto.randomUUID()}`,
    });
    await recordSystemEvent(createAdminClient(), {
      eventType: "daily_report_background_learning_processed",
      userId,
      operation: "daily_report_upsert",
      entityType: "daily_gut_report",
      metadata: result,
    });
  } catch (error) {
    await recordSystemEvent(createAdminClient(), {
      eventType: "daily_report_background_learning_failed",
      severity: "error",
      userId,
      operation: "daily_report_upsert",
      entityType: "daily_gut_report",
      metadata: errorMetadata(error),
    });
  }
}

function minimalStructuredAnalysis() {
  return {
    dishName: "Food",
    dishConfidence: "low" as const,
    clarity: "unclear" as const,
    components: [],
    visibleIngredients: [],
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    model: "daily-report-upsert",
    promptVersion: "daily-report-upsert",
    imageDetail: "not_applicable" as const,
  };
}

function addDays(localDate: string, offset: number) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
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
    const body = await readJsonBody<{
      localDate?: string;
      gutSeverity?: number;
      symptomTags?: string[];
      notes?: string;
    }>(request);

    if (!body.localDate || typeof body.gutSeverity !== "number") {
      return errorResponse(
        "localDate and gutSeverity are required.",
        400,
        "invalid_request",
      );
    }

    const severity = Math.round(body.gutSeverity);
    if (severity < 0 || severity > 10) {
      return errorResponse(
        "gutSeverity must be between 0 and 10.",
        400,
        "invalid_severity",
      );
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    await requireEntitledUser(admin, user.id);
    const symptomTags = severity === 0
      ? ["None"]
      : (body.symptomTags ?? []).filter((tag) =>
        tag.trim().toLowerCase() !== "none"
      );

    const { data: reportRow, error: reportError } = await admin
      .from("daily_gut_reports")
      .upsert(
        {
          user_id: user.id,
          local_date: body.localDate,
          gut_severity: severity,
          symptom_tags: symptomTags,
          notes: body.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,local_date" },
      )
      .select("*")
      .single();

    if (reportError) {
      throw reportError;
    }

    const dailyScoreWindowDates = [
      body.localDate,
      addDays(body.localDate, -1),
      addDays(body.localDate, -2),
    ];
    const { data: scanRows, error: scansError } = await admin
      .from("scans")
      .select("id, scan_category, local_date, overall_risk_score, created_at")
      .eq("user_id", user.id)
      .eq("analysis_status", "completed")
      .in("local_date", dailyScoreWindowDates);

    if (scansError) {
      throw scansError;
    }

    const recomputeScans: ScanForInsightRecompute[] = (scanRows ?? []).map((
      scan,
    ) => ({
      id: String(scan.id),
      structuredAnalysis: minimalStructuredAnalysis(),
      overallRiskScore: Number(scan.overall_risk_score ?? 50),
      createdAt: scan.created_at ? String(scan.created_at) : undefined,
      localDate: scan.local_date ? String(scan.local_date) : undefined,
      scanCategory:
        scan.scan_category === "menu" || scan.scan_category === "grocery"
          ? scan.scan_category
          : "food",
    }));
    const scoredReport = computeDailyScoreForReport(
      mapDailyReportRow(reportRow as Record<string, unknown>),
      recomputeScans,
    );

    const { data: scoredReportRow, error: scoreUpdateError } = await admin
      .from("daily_gut_reports")
      .update({
        daily_score: scoredReport.dailyScore ?? null,
        daily_score_components: scoredReport.dailyScoreComponents ?? {},
        daily_score_drivers: scoredReport.dailyScoreDrivers ?? [],
        daily_score_updated_at: scoredReport.dailyScoreUpdatedAt ??
          new Date().toISOString(),
      })
      .eq("id", String(reportRow.id))
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (scoreUpdateError) {
      throw scoreUpdateError;
    }

    let learningSyncStatus: "queued" | "failed" = "queued";
    try {
      await enqueueLearningJob(admin, {
        userId: user.id,
        eventType: "daily_report_saved",
        sourceType: "daily_gut_report",
        sourceId: String(scoredReportRow.id),
        runAfterSeconds: 0,
        metadata: {
          localDate: body.localDate,
          gutSeverity: severity,
          symptomTags,
        },
      });
    } catch (error) {
      learningSyncStatus = "failed";
      await recordSystemEvent(admin, {
        eventType: "daily_report_learning_job_enqueue_failed",
        severity: "error",
        userId: user.id,
        operation: "daily_report_upsert",
        entityType: "daily_gut_report",
        entityId: String(scoredReportRow.id),
        metadata: errorMetadata(error),
      });
    }

    const responseReport = mapDailyReportRow(
      scoredReportRow as Record<string, unknown>,
    );
    try {
      await updateUserAppSnapshotDailyReport(admin, user.id, responseReport, {
        sourceType: "daily_gut_report",
        sourceId: String(scoredReportRow.id),
        learningStatus: learningSyncStatus === "queued" ? "pending" : "failed",
      });
    } catch (error) {
      await recordSystemEvent(admin, {
        eventType: "daily_report_snapshot_refresh_failed",
        severity: "error",
        userId: user.id,
        operation: "daily_report_upsert",
        entityType: "daily_gut_report",
        entityId: String(scoredReportRow.id),
        metadata: errorMetadata(error),
      });
    }

    if (learningSyncStatus === "queued") {
      waitUntilBackground(processLearningJobsInBackground(user.id));
    }

    return jsonResponse({
      ok: true,
      report: responseReport,
      learningSyncStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[daily-report-upsert]", error);
    return errorResponse(
      "Daily report could not be saved.",
      500,
      "daily_report_save_failed",
    );
  }
});

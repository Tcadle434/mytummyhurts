import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, mapDailyReportRow } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{
      localDate?: string;
      gutSeverity?: number;
      symptomTags?: string[];
      notes?: string;
    }>(request);

    if (!body.localDate || typeof body.gutSeverity !== 'number') {
      return errorResponse('localDate and gutSeverity are required.', 400, 'invalid_request');
    }

    const severity = Math.round(body.gutSeverity);
    if (severity < 0 || severity > 10) {
      return errorResponse('gutSeverity must be between 0 and 10.', 400, 'invalid_severity');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);
    const symptomTags = severity === 0
      ? ['None']
      : (body.symptomTags ?? []).filter((tag) => tag.trim().toLowerCase() !== 'none');

    const { data: reportRow, error: reportError } = await admin
      .from('daily_gut_reports')
      .upsert(
        {
          user_id: user.id,
          local_date: body.localDate,
          gut_severity: severity,
          symptom_tags: symptomTags,
          notes: body.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,local_date' },
      )
      .select('*')
      .single();

    if (reportError) {
      throw reportError;
    }

    const { profile, insights, conditionInsights, dailyReports } = await rebuildInsightsAndProfile(admin, user.id, {
      eventType: severity <= 3 ? 'calm_daily_report' : severity >= 7 ? 'reactive_daily_report' : 'neutral_daily_report',
      sourceType: 'daily_gut_report',
      sourceId: String(reportRow.id),
    });
    const report = dailyReports.find((entry) => entry.id === String(reportRow.id)) ?? mapDailyReportRow(reportRow as Record<string, unknown>);

    return jsonResponse({
      ok: true,
      report,
      profile,
      insights,
      conditionInsights,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[daily-report-upsert]', error);
    return errorResponse('Daily report could not be saved.', 500, 'daily_report_save_failed');
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody, requireInternalSecret } from '../_shared/http.ts';
import { processDueLearningJobs } from '../_shared/learningJobs.ts';
import { createAdminClient } from '../_shared/supabase.ts';

function requireWorkerSecret(request: Request) {
  try {
    requireInternalSecret(request, 'FOLLOWUP_DISPATCH_SECRET');
    return;
  } catch (error) {
    if (!(error instanceof Error) || !['forbidden', 'internal_secret_missing'].includes(error.message)) {
      throw error;
    }
  }

  requireInternalSecret(request, 'MAINTENANCE_DISPATCH_SECRET');
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    requireWorkerSecret(request);
    const body = await readJsonBody<{ limit?: number; workerId?: string }>(request);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 25)));
    const workerId = body.workerId?.trim() || `learning-jobs-process:${crypto.randomUUID()}`;
    const result = await processDueLearningJobs(createAdminClient(), { limit, workerId });

    return jsonResponse({
      ok: true,
      learningJobs: result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return errorResponse('Forbidden.', 403, 'forbidden');
    }

    console.error('[learning-jobs-process]', error);
    return errorResponse('Learning jobs could not be processed.', 500, 'learning_jobs_process_failed');
  }
});

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow } from '../_shared/db.ts';
import { ApiError, apiErrorResponse, errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { errorMetadata, recordSystemEvent } from '../_shared/observability.ts';
import { analyzeReservedScan } from '../_shared/scanAnalysis.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const SCAN_ANALYZE_IMAGE_DEPLOY_MARKER = 'food-risk-rubric-v2-20260522';
void SCAN_ANALYZE_IMAGE_DEPLOY_MARKER;

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  const admin = createAdminClient();

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{
      requestId?: string;
      imagePath?: string;
      imagePaths?: string[];
      thumbnailImagePaths?: (string | null)[];
      imageDataUrl?: string;
      imageDataUrls?: string[];
      sourceType?: string;
      scanCategory?: string;
      localDate?: string;
      timezone?: string;
    }>(request);

    await ensureUserRow(admin, user);
    const response = await analyzeReservedScan(admin, user, {
      kind: 'image',
      imagePath: body.imagePath,
      imagePaths: body.imagePaths,
      body,
    });

    return jsonResponse(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error('[scan-analyze-image]', error);
    await recordSystemEvent(admin, {
      eventType: 'scan_analyze_image_unhandled_error',
      severity: 'error',
      operation: 'scan_analysis',
      metadata: errorMetadata(error),
    });
    return errorResponse('The meal could not be analyzed.', 500, 'analysis_failed');
  }
});

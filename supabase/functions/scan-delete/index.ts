import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const mealImagesBucket = 'meal-images';

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{ scanId?: string }>(request);

    if (!body.scanId) {
      return errorResponse('scanId is required.', 400, 'invalid_request');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { data: scanRow, error: scanLookupError } = await admin
      .from('scans')
      .select('id, image_storage_path')
      .eq('id', body.scanId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (scanLookupError) {
      throw scanLookupError;
    }

    if (!scanRow) {
      return errorResponse('Scan not found.', 404, 'scan_not_found');
    }

    const { error: scanDeleteError } = await admin.from('scans').delete().eq('id', body.scanId).eq('user_id', user.id);
    if (scanDeleteError) {
      throw scanDeleteError;
    }

    const imageStoragePath =
      typeof scanRow.image_storage_path === 'string' && scanRow.image_storage_path.length > 0
        ? scanRow.image_storage_path
        : null;

    if (imageStoragePath) {
      const { error: imageDeleteError } = await admin.storage.from(mealImagesBucket).remove([imageStoragePath]);
      if (imageDeleteError) {
        console.warn('[scan-delete] failed to remove scan image', imageDeleteError);
      }
    }

    const { profile, insights, conditionInsights } = await rebuildInsightsAndProfile(admin, user.id, {
      eventType: 'scan_deleted',
      sourceType: 'scan',
      sourceId: body.scanId,
    });

    return jsonResponse({
      ok: true,
      scanId: body.scanId,
      profile,
      insights,
      conditionInsights,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[scan-delete]', error);
    return errorResponse('The scan could not be deleted.', 500, 'scan_delete_failed');
  }
});

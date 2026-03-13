import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
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
    const body = await readJsonBody<{ pushToken?: string; platform?: string }>(request);
    if (!body.pushToken) {
      return errorResponse('pushToken is required.', 400, 'invalid_request');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { error } = await admin.from('device_tokens').upsert(
      {
        user_id: user.id,
        platform: body.platform ?? 'ios',
        push_token: body.pushToken,
        disabled_at: null,
        last_error_at: null,
        last_error_reason: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,push_token' },
    );

    if (error) {
      throw error;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[notifications-register-token]', error);
    return errorResponse('The push token could not be registered.', 500, 'notification_registration_failed');
  }
});

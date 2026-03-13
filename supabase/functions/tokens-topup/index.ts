import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow, getBillingState } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const configuredTopUps = (() => {
  const raw = Deno.env.get('TOP_UP_PRODUCTS_JSON') ?? '';
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return Object.entries(parsed).reduce<Record<string, number>>((accumulator, [productId, tokens]) => {
      if (productId && Number.isFinite(tokens) && tokens > 0) {
        accumulator[productId] = Number(tokens);
      }

      return accumulator;
    }, {});
  } catch (error) {
    console.warn('[tokens-topup] invalid TOP_UP_PRODUCTS_JSON', error);
    return null;
  }
})();

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{ productId?: string; transactionId?: string; originalTransactionId?: string }>(request);
    if (!configuredTopUps || Object.keys(configuredTopUps).length === 0) {
      return errorResponse('Top-ups are not configured for this app.', 501, 'topups_unavailable');
    }

    if (!body.productId || !body.transactionId) {
      return errorResponse('productId and transactionId are required.', 400, 'invalid_request');
    }

    const tokenAmount = configuredTopUps[body.productId];
    if (!tokenAmount) {
      return errorResponse('That top-up product is not recognized.', 400, 'invalid_topup_product');
    }

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const { error } = await admin.rpc('apply_external_token_delta', {
      p_user_id: user.id,
      p_delta: tokenAmount,
      p_reason: 'topup_purchase',
      p_external_reference: body.originalTransactionId ?? body.transactionId,
      p_provider: 'app_store',
    });

    if (error) {
      throw error;
    }

    const billing = await getBillingState(admin, user.id);
    return jsonResponse({ ok: true, billing });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[tokens-topup]', error);
    return errorResponse('The token top-up could not be applied.', 500, 'topup_failed');
  }
});

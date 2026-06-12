import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

type ExistingAccountCheckReason =
  | 'missing_entitlement'
  | 'incomplete_profile'
  | 'fresh_orphan_deleted'
  | 'not_found';

const ENTITLED_STATUSES = new Set(['trialing', 'active', 'in_grace']);
const FRESH_ORPHAN_WINDOW_MS = 10 * 60 * 1000;

function jsonArrayLength(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasObjectKeys(value: unknown) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

function hasMeaningfulProfile(profile: Record<string, unknown> | null | undefined) {
  if (!profile) {
    return false;
  }

  const stomachProfile = profile.stomach_profile_blob;
  const stomachProfileMetadata =
    stomachProfile && typeof stomachProfile === 'object' && !Array.isArray(stomachProfile)
      ? (stomachProfile as Record<string, unknown>).metadata
      : null;

  return (
    jsonArrayLength(profile.known_conditions) > 0 ||
    jsonArrayLength(profile.known_ingredient_sensitivities) > 0 ||
    jsonArrayLength(profile.common_symptoms) > 0 ||
    jsonArrayLength(profile.meal_contexts) > 0 ||
    jsonArrayLength(profile.current_eating_patterns) > 0 ||
    jsonArrayLength(profile.lifestyle_factors) > 0 ||
    jsonArrayLength(profile.foods_to_reintroduce) > 0 ||
    hasText(profile.symptom_frequency) ||
    hasText(profile.symptom_severity_baseline) ||
    hasText(profile.motivation) ||
    hasObjectKeys(stomachProfileMetadata)
  );
}

async function getExactCount(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  userId: string,
) {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function maybeDeleteFreshOrphan({
  userId,
  hasEntitlement,
  meaningfulProfile,
  dataCounts,
}: {
  userId: string;
  hasEntitlement: boolean;
  meaningfulProfile: boolean;
  dataCounts: { scans: number; reports: number; subscriptions: number };
}) {
  if (hasEntitlement || meaningfulProfile) {
    return false;
  }

  if (dataCounts.scans > 0 || dataCounts.reports > 0 || dataCounts.subscriptions > 0) {
    return false;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user?.created_at) {
    console.warn('[auth-existing-account-check] could not load auth user for cleanup', error);
    return false;
  }

  const createdAtMs = new Date(data.user.created_at).getTime();
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > FRESH_ORPHAN_WINDOW_MS) {
    return false;
  }

  const { error: publicDeleteError } = await admin.from('users').delete().eq('id', userId);
  if (publicDeleteError) {
    throw publicDeleteError;
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    throw authDeleteError;
  }

  return true;
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{ cleanupFreshUnentitledUser?: boolean }>(request);
    const admin = createAdminClient();

    const [{ data: userRow, error: userError }, { data: profileRow, error: profileError }] =
      await Promise.all([
        admin.from('users').select('id, subscription_status').eq('id', user.id).maybeSingle(),
        admin
          .from('user_profiles')
          .select(
            [
              'known_conditions',
              'known_ingredient_sensitivities',
              'common_symptoms',
              'symptom_frequency',
              'symptom_severity_baseline',
              'meal_contexts',
              'motivation',
              'current_eating_patterns',
              'lifestyle_factors',
              'foods_to_reintroduce',
              'stomach_profile_blob',
            ].join(','),
          )
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

    if (userError) {
      throw userError;
    }

    if (profileError) {
      throw profileError;
    }

    const hasEntitlement = ENTITLED_STATUSES.has(String(userRow?.subscription_status ?? 'none'));
    const meaningfulProfile = hasMeaningfulProfile(profileRow as Record<string, unknown> | null);

    if (userRow && hasEntitlement && meaningfulProfile) {
      return jsonResponse({
        ok: true,
        allowed: true,
      });
    }

    const reason: ExistingAccountCheckReason = !userRow
      ? 'not_found'
      : !hasEntitlement
        ? 'missing_entitlement'
        : 'incomplete_profile';

    if (body.cleanupFreshUnentitledUser) {
      const [scans, reports, subscriptions] = await Promise.all([
        getExactCount(admin, 'scans', user.id),
        getExactCount(admin, 'daily_gut_reports', user.id),
        getExactCount(admin, 'subscriptions', user.id),
      ]);

      const deletedOrphan = await maybeDeleteFreshOrphan({
        userId: user.id,
        hasEntitlement,
        meaningfulProfile,
        dataCounts: { scans, reports, subscriptions },
      });

      if (deletedOrphan) {
        return jsonResponse({
          ok: true,
          allowed: false,
          reason: 'fresh_orphan_deleted',
          deletedOrphan: true,
        });
      }
    }

    return jsonResponse({
      ok: true,
      allowed: false,
      reason,
      deletedOrphan: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[auth-existing-account-check]', error);
    return errorResponse('Existing account could not be verified.', 500, 'existing_account_check_failed');
  }
});

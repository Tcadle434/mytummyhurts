import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { ensureUserRow } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const mealImagesBucket = 'meal-images';

async function listMealImagePaths(prefix: string) {
  const admin = createAdminClient();
  const pathsToDelete: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(mealImagesBucket).list(prefix, {
      limit: 100,
      offset,
    });

    if (error) {
      console.warn('[account-delete] failed to list meal images', error);
      break;
    }

    if (!data?.length) {
      break;
    }

    for (const entry of data) {
      if (entry.name) {
        pathsToDelete.push(`${prefix}/${entry.name}`);
      }
    }

    offset += data.length;
    if (data.length < 100) {
      break;
    }
  }

  return pathsToDelete;
}

async function removeMealImages(userId: string) {
  const admin = createAdminClient();
  const pathsToDelete = Array.from(
    new Set([
      ...(await listMealImagePaths(userId)),
      ...(await listMealImagePaths(`${userId}/thumbnails`)),
    ]),
  );

  if (!pathsToDelete.length) {
    return;
  }

  const { error } = await admin.storage.from(mealImagesBucket).remove(pathsToDelete);
  if (error) {
    console.warn('[account-delete] failed to remove meal images', error);
  }
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
    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    await removeMealImages(user.id);

    const { error: dataDeleteError } = await admin.from('users').delete().eq('id', user.id);
    if (dataDeleteError) {
      throw dataDeleteError;
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);
    if (authDeleteError) {
      throw authDeleteError;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[account-delete]', error);
    return errorResponse('The account could not be deleted.', 500, 'account_delete_failed');
  }
});

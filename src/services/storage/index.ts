import { requireSupabaseClient } from '../supabase/client';
import { createId } from '../../utils/id';

const mealImagesBucket = 'meal-images';

function inferExtension(uri: string) {
  const match = uri.toLowerCase().match(/\.(heic|heif|jpg|jpeg|png|webp)(\?.*)?$/);
  if (!match) {
    return 'jpg';
  }

  return match[1] === 'jpeg' ? 'jpg' : (match[1] ?? 'jpg');
}

function inferContentType(extension: string) {
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

export async function uploadMealImage(localUri: string, userId: string) {
  const extension = inferExtension(localUri);
  const fileName = `${Date.now()}-${createId('meal')}.${extension}`;
  const storagePath = `${userId}/${fileName}`;

  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();

  const { error } = await requireSupabaseClient().storage.from(mealImagesBucket).upload(storagePath, blob, {
    cacheControl: '3600',
    contentType: blob.type || inferContentType(extension),
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return storagePath;
}

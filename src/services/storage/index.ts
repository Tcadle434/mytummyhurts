import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { requireSupabaseClient } from '../supabase/client';
import { createId } from '../../utils/id';
import { extensionForImageContentType, normalizeImageDataUrl } from '../images/imageData';

const mealImagesBucket = 'meal-images';
const thumbnailMaxWidth = 512;
const thumbnailQuality = 0.7;

export type UploadMealImageResult = {
  storagePath: string;
  thumbnailStoragePath?: string;
};

function inferExtension(uri: string) {
  const match = uri.toLowerCase().match(/\.(heic|heif|jpg|jpeg|png|webp|gif)(\?.*)?$/);
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
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

function parseDataUrl(dataUrl: string) {
  const normalized = normalizeImageDataUrl(dataUrl);

  return normalized
    ? {
        contentType: normalized.contentType,
        base64: normalized.base64,
      }
    : null;
}

function bytesFromBase64(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function blobFromXhr(uri: string) {
  return new Promise<Blob>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.onload = () => {
      const blob = request.response;
      if (blob instanceof Blob) {
        resolve(blob);
        return;
      }

      reject(new Error('The selected image could not be read.'));
    };
    request.onerror = () => reject(new Error('The selected image could not be read.'));
    request.responseType = 'blob';
    request.open('GET', uri, true);
    request.send(null);
  });
}

async function blobFromLocalUri(uri: string) {
  try {
    const fileResponse = await fetch(uri);
    const blob = await fileResponse.blob();
    if (blob.size > 0) {
      return blob;
    }
  } catch {
    // React Native's fetch can fail or return an empty blob for some photo-library
    // assets. XHR is more reliable for local file URIs in those cases.
  }

  const fallbackBlob = await blobFromXhr(uri);
  if (fallbackBlob.size <= 0) {
    throw new Error('The selected image was empty. Try choosing the screenshot again.');
  }

  return fallbackBlob;
}

async function uploadImageBytes(storagePath: string, uploadBody: Blob | ArrayBuffer, contentType: string, cacheControl = '3600') {
  const { error } = await requireSupabaseClient().storage.from(mealImagesBucket).upload(storagePath, uploadBody, {
    cacheControl,
    contentType,
    upsert: false,
  });

  if (error) {
    throw error;
  }
}

async function createThumbnailUpload(localUri: string, userId: string, originalFileName: string) {
  const baseName = originalFileName.replace(/\.[^.]+$/, '');
  const thumbnailPath = `${userId}/thumbnails/${baseName}-thumb.jpg`;
  const thumbnail = await manipulateAsync(
    localUri,
    [{ resize: { width: thumbnailMaxWidth } }],
    {
      compress: thumbnailQuality,
      format: SaveFormat.JPEG,
      base64: true,
    },
  );
  const normalizedThumbnail = normalizeImageDataUrl(
    thumbnail.base64 ? `data:image/jpeg;base64,${thumbnail.base64}` : null,
  );
  if (!normalizedThumbnail) {
    throw new Error('The selected image thumbnail could not be created.');
  }

  await uploadImageBytes(
    thumbnailPath,
    bytesFromBase64(normalizedThumbnail.base64).buffer,
    'image/jpeg',
    '604800',
  );

  return thumbnailPath;
}

export async function uploadMealImage(localUri: string, userId: string, imageDataUrl?: string): Promise<UploadMealImageResult> {
  const parsedDataUrl = imageDataUrl ? parseDataUrl(imageDataUrl) : null;
  const extension = parsedDataUrl ? extensionForImageContentType(parsedDataUrl.contentType) : inferExtension(localUri);
  const fileName = `${Date.now()}-${createId('meal')}.${extension}`;
  const storagePath = `${userId}/${fileName}`;
  const uploadBody = parsedDataUrl ? bytesFromBase64(parsedDataUrl.base64).buffer : await blobFromLocalUri(localUri);
  const contentType =
    parsedDataUrl?.contentType ??
    (uploadBody instanceof Blob ? uploadBody.type : null) ??
    inferContentType(extension);

  await uploadImageBytes(storagePath, uploadBody, contentType);

  try {
    return {
      storagePath,
      thumbnailStoragePath: await createThumbnailUpload(localUri, userId, fileName),
    };
  } catch (error) {
    console.warn('[storage] thumbnail upload failed; using original scan image only.', error);
    return { storagePath };
  }
}

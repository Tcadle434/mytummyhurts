const supportedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function bytePrefixFromBase64(base64: string, byteCount = 16) {
  const chunkLength = Math.ceil(byteCount / 3) * 4;
  const chunk = base64.slice(0, chunkLength);
  try {
    const binary = globalThis.atob(chunk);
    return Array.from(binary.slice(0, byteCount), (character) => character.charCodeAt(0));
  } catch {
    return [];
  }
}

function isPlausibleBase64(value: string) {
  if (!value || value.length % 4 === 1) {
    return false;
  }

  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function detectImageMimeTypeFromBase64(base64: string) {
  const bytes = bytePrefixFromBase64(base64, 16);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  const ascii = String.fromCharCode(...bytes);
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) {
    return 'image/gif';
  }

  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

export function normalizeImageDataUrl(dataUrl: string | undefined | null) {
  const match = dataUrl?.trim().match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  const base64 = (match[2] ?? '').replace(/\s/g, '');
  if (!isPlausibleBase64(base64)) {
    return null;
  }

  const detectedMimeType = detectImageMimeTypeFromBase64(base64);
  if (!detectedMimeType || !supportedImageMimeTypes.has(detectedMimeType)) {
    return null;
  }

  return {
    dataUrl: `data:${detectedMimeType};base64,${base64}`,
    base64,
    contentType: detectedMimeType,
  };
}

export function imageDataUrlFromBase64(base64: string | null | undefined, declaredMimeType?: string | null) {
  if (!base64) {
    return null;
  }

  const fallbackMimeType = declaredMimeType?.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : declaredMimeType?.toLowerCase() || 'image/jpeg';
  return normalizeImageDataUrl(`data:${fallbackMimeType};base64,${base64}`);
}

export function extensionForImageContentType(contentType: string) {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

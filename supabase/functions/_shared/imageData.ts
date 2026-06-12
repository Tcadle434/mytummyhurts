const supportedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function base64BytePrefix(base64: string, byteCount = 16) {
  const chunkLength = Math.ceil(byteCount / 3) * 4;
  const chunk = base64.slice(0, chunkLength);
  try {
    const binary = atob(chunk);
    return Array.from(binary.slice(0, byteCount), (character) => character.charCodeAt(0));
  } catch {
    return [];
  }
}

function detectImageMimeTypeFromBase64(base64: string) {
  const bytes = base64BytePrefix(base64, 16);

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

function isPlausibleBase64(value: string) {
  if (!value || value.length % 4 === 1) {
    return false;
  }

  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function normalizeInlineImageDataUrl(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
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

  return `data:${detectedMimeType};base64,${base64}`;
}

export function inlineImageDataUrlPayload(dataUrl: string) {
  const normalized = normalizeInlineImageDataUrl(dataUrl);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
  if (!match) {
    return null;
  }

  const contentType = match[1] ?? 'image/jpeg';
  const base64 = match[2] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    contentType,
    base64,
    bytes,
  };
}

export function extensionForInlineImageContentType(contentType: string) {
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

export function inlineImageDataUrlByteLength(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return 0;
  }

  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

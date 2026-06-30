// Ported from supabase/functions/_shared/imageData.ts — the inline base64 image
// handling used by the scan-analyze endpoints. Keeps the same mime → extension
// mapping so stored object keys are byte-compatible with the old pipeline.
export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function extForContentType(contentType: string): string {
  return MIME_EXT[contentType.toLowerCase()] ?? 'bin';
}

export interface ParsedDataUrl {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl.trim());
  if (!match) throw new Error('invalid_data_url');
  const contentType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) throw new Error('empty_image');
  return { buffer, contentType, ext: extForContentType(contentType) };
}

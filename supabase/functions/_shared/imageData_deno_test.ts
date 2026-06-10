import { inlineImageDataUrlByteLength, inlineImageDataUrlPayload, normalizeInlineImageDataUrl } from './imageData.ts';

const onePixelJpeg =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';
const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const heicHeader = 'AAAAHGZ0eXBoZWljAAAAAGhlaWNoZWlm';

Deno.test('normalizeInlineImageDataUrl accepts and normalizes image/jpg JPEG data', () => {
  const normalized = normalizeInlineImageDataUrl(`data:image/jpg;base64,${onePixelJpeg}`);

  if (!normalized?.startsWith('data:image/jpeg;base64,')) {
    throw new Error(`Expected normalized JPEG data URL, got ${normalized ?? 'null'}`);
  }
});

Deno.test('normalizeInlineImageDataUrl accepts PNG data with whitespace in base64', () => {
  const withWhitespace = `${onePixelPng.slice(0, 20)}\n${onePixelPng.slice(20)}`;
  const normalized = normalizeInlineImageDataUrl(`data:image/png;base64,${withWhitespace}`);

  if (!normalized?.startsWith('data:image/png;base64,')) {
    throw new Error(`Expected normalized PNG data URL, got ${normalized ?? 'null'}`);
  }
  if (normalized.includes('\n')) {
    throw new Error('Expected normalized data URL to strip whitespace.');
  }
});

Deno.test('normalizeInlineImageDataUrl rejects unsupported HEIC data', () => {
  const normalized = normalizeInlineImageDataUrl(`data:image/heic;base64,${heicHeader}`);

  if (normalized !== null) {
    throw new Error(`Expected unsupported HEIC data URL to be rejected, got ${normalized}`);
  }
});

Deno.test('normalizeInlineImageDataUrl rejects malformed base64', () => {
  const normalized = normalizeInlineImageDataUrl('data:image/jpeg;base64,this-is-not-valid-base64!');

  if (normalized !== null) {
    throw new Error(`Expected malformed base64 to be rejected, got ${normalized}`);
  }
});

Deno.test('inlineImageDataUrlByteLength estimates decoded bytes', () => {
  const normalized = normalizeInlineImageDataUrl(`data:image/png;base64,${onePixelPng}`);
  if (!normalized) {
    throw new Error('Expected PNG fixture to normalize.');
  }

  const byteLength = inlineImageDataUrlByteLength(normalized);
  if (byteLength <= 0) {
    throw new Error(`Expected positive byte length, got ${byteLength}`);
  }
});

Deno.test('inlineImageDataUrlPayload returns bytes and detected content type for storage upload', () => {
  const normalized = normalizeInlineImageDataUrl(`data:image/png;base64,${onePixelPng}`);
  if (!normalized) {
    throw new Error('Expected PNG fixture to normalize.');
  }

  const payload = inlineImageDataUrlPayload(normalized);
  if (!payload) {
    throw new Error('Expected payload to parse.');
  }

  if (payload.contentType !== 'image/png') {
    throw new Error(`Expected image/png content type, got ${payload.contentType}`);
  }

  if (payload.bytes.byteLength !== inlineImageDataUrlByteLength(normalized)) {
    throw new Error('Expected decoded byte length to match estimated data URL byte length.');
  }
});

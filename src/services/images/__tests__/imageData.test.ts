import { describe, expect, it } from 'vitest';

import { extensionForImageContentType, imageDataUrlFromBase64, normalizeImageDataUrl } from '../imageData';

const jpegBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const heicHeaderBase64 = 'AAAAHGZ0eXBoZWljAAAAAGhlaWNoZWlm';

describe('imageData', () => {
  it('normalizes JPEG data URLs using the actual byte signature', () => {
    const normalized = normalizeImageDataUrl(`data:image/jpg;base64,${jpegBase64}`);

    expect(normalized?.contentType).toBe('image/jpeg');
    expect(normalized?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('keeps valid PNG data URLs as PNG', () => {
    const normalized = imageDataUrlFromBase64(pngBase64, 'image/jpeg');

    expect(normalized?.contentType).toBe('image/png');
    expect(normalized?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('rejects HEIC bytes even when declared as JPEG', () => {
    const normalized = normalizeImageDataUrl(`data:image/jpeg;base64,${heicHeaderBase64}`);

    expect(normalized).toBeNull();
  });

  it('maps supported content types to upload extensions', () => {
    expect(extensionForImageContentType('image/jpeg')).toBe('jpg');
    expect(extensionForImageContentType('image/png')).toBe('png');
    expect(extensionForImageContentType('image/webp')).toBe('webp');
    expect(extensionForImageContentType('image/gif')).toBe('gif');
  });
});

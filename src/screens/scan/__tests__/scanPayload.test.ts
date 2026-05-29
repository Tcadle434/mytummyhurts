import { describe, expect, it } from 'vitest';

import { buildBarcodeScanPayload, buildImageScanPayload } from '../scanPayload';

describe('scan payload builders', () => {
  it('builds an explicit menu image payload with all uploaded images', () => {
    const payload = buildImageScanPayload({
      requestId: 'scan-request-test',
      sourceType: 'upload',
      scanCategory: 'menu',
      images: [
        { uri: 'file://menu-1.jpg', dataUrl: 'data:image/jpeg;base64,one' },
        { uri: 'file://menu-2.jpg', dataUrl: 'data:image/jpeg;base64,two' },
      ],
    });

    expect(payload).toMatchObject({
      requestId: 'scan-request-test',
      sourceType: 'upload',
      scanCategory: 'menu',
      imageUri: 'file://menu-1.jpg',
      imageUris: ['file://menu-1.jpg', 'file://menu-2.jpg'],
      imageDataUrl: 'data:image/jpeg;base64,one',
      imageDataUrls: ['data:image/jpeg;base64,one', 'data:image/jpeg;base64,two'],
    });
  });

  it('builds an explicit food camera capture payload', () => {
    const payload = buildImageScanPayload({
      requestId: 'scan-request-camera',
      sourceType: 'camera',
      scanCategory: 'food',
      images: [{ uri: 'file://plate.jpg' }],
    });

    expect(payload.scanCategory).toBe('food');
    expect(payload.imageUri).toBe('file://plate.jpg');
    expect(payload.imageDataUrls).toEqual([]);
  });

  it('routes barcode scans to grocery analysis', () => {
    expect(buildBarcodeScanPayload({
      requestId: 'scan-request-barcode',
      barcode: '012345678905',
    })).toMatchObject({
      requestId: 'scan-request-barcode',
      sourceType: 'barcode',
      scanCategory: 'grocery',
      barcode: '012345678905',
    });
  });
});

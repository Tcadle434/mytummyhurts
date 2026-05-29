import { ScanCategory, ScanInputPayload } from '../../types/domain';

export type ScanPayloadImage = {
  uri: string;
  dataUrl?: string;
};

export function buildImageScanPayload({
  requestId,
  sourceType,
  scanCategory,
  images,
}: {
  requestId: string;
  sourceType: 'camera' | 'upload';
  scanCategory: Extract<ScanCategory, 'food' | 'menu'>;
  images: ScanPayloadImage[];
}): ScanInputPayload {
  const dataUrls = images
    .map((image) => image.dataUrl)
    .filter((dataUrl): dataUrl is string => Boolean(dataUrl));

  return {
    requestId,
    sourceType,
    scanCategory,
    imageUri: images[0]?.uri,
    imageUris: images.map((image) => image.uri),
    imageDataUrl: dataUrls[0],
    imageDataUrls: dataUrls,
  };
}

export function buildBarcodeScanPayload({
  requestId,
  barcode,
}: {
  requestId: string;
  barcode: string;
}): ScanInputPayload {
  return {
    requestId,
    sourceType: 'barcode',
    scanCategory: 'grocery',
    barcode,
  };
}

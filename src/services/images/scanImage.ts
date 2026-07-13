import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ImagePickerAsset } from 'expo-image-picker';

import { imageDataUrlFromBase64, normalizeImageDataUrl } from './imageData';
import { scanImageResizeActions } from './scanImageResize';

export type PreparedScanImage = {
  uri: string;
  dataUrl: string;
  width?: number;
  height?: number;
};

export function scanImageDataUrl(base64: string | null | undefined, mimeType?: string | null) {
  return imageDataUrlFromBase64(base64, mimeType)?.dataUrl;
}

export async function prepareCameraScanImage({
  uri,
  quality,
  width,
  height,
}: {
  uri: string;
  quality: number;
  width?: number;
  height?: number;
}): Promise<PreparedScanImage> {
  const converted = await manipulateAsync(
    uri,
    scanImageResizeActions(width, height),
    {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    },
  );
  const normalizedConvertedData = normalizeImageDataUrl(
    converted.base64 ? `data:image/jpeg;base64,${converted.base64}` : null,
  );
  if (!normalizedConvertedData) {
    throw new Error('The captured image could not be converted to a supported format.');
  }

  return {
    uri: converted.uri,
    dataUrl: normalizedConvertedData.dataUrl,
    width: converted.width,
    height: converted.height,
  };
}

export async function prepareScanImageAsset(asset: ImagePickerAsset, quality: number): Promise<PreparedScanImage> {
  const converted = await manipulateAsync(
    asset.uri,
    scanImageResizeActions(asset.width, asset.height),
    {
      compress: quality,
      format: SaveFormat.JPEG,
      base64: true,
    },
  );
  const normalizedConvertedData = normalizeImageDataUrl(
    converted.base64 ? `data:image/jpeg;base64,${converted.base64}` : null,
  );
  if (!normalizedConvertedData) {
    throw new Error('The selected image could not be converted to a supported format.');
  }

  return {
    uri: converted.uri,
    dataUrl: normalizedConvertedData.dataUrl,
    width: converted.width,
    height: converted.height,
  };
}

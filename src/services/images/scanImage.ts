import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ImagePickerAsset } from 'expo-image-picker';

import { imageDataUrlFromBase64, normalizeImageDataUrl } from './imageData';

export type PreparedScanImage = {
  uri: string;
  dataUrl: string;
  width?: number;
  height?: number;
};

export function scanImageDataUrl(base64: string | null | undefined, mimeType?: string | null) {
  return imageDataUrlFromBase64(base64, mimeType)?.dataUrl;
}

export async function prepareScanImageAsset(asset: ImagePickerAsset, quality: number): Promise<PreparedScanImage> {
  const normalizedPickerData = imageDataUrlFromBase64(asset.base64, asset.mimeType);
  if (normalizedPickerData) {
    return {
      uri: asset.uri,
      dataUrl: normalizedPickerData.dataUrl,
      width: asset.width,
      height: asset.height,
    };
  }

  const converted = await manipulateAsync(
    asset.uri,
    [],
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

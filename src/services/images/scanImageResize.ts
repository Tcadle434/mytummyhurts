export const SCAN_IMAGE_MAX_DIMENSION = 2400;

export function scanImageResizeActions(width?: number, height?: number) {
  if (!width || !height || Math.max(width, height) <= SCAN_IMAGE_MAX_DIMENSION) return [];
  return width >= height
    ? [{ resize: { width: SCAN_IMAGE_MAX_DIMENSION } }]
    : [{ resize: { height: SCAN_IMAGE_MAX_DIMENSION } }];
}

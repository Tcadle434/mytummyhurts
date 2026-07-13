import { describe, expect, it } from 'vitest';

import { SCAN_IMAGE_MAX_DIMENSION, scanImageResizeActions } from '../scanImageResize';

describe('scan image sizing', () => {
  it('keeps smaller images at their original resolution', () => {
    expect(scanImageResizeActions(1600, 2200)).toEqual([]);
  });

  it('caps the long edge while preserving the aspect ratio', () => {
    expect(scanImageResizeActions(4032, 3024)).toEqual([
      { resize: { width: SCAN_IMAGE_MAX_DIMENSION } },
    ]);
    expect(scanImageResizeActions(3024, 4032)).toEqual([
      { resize: { height: SCAN_IMAGE_MAX_DIMENSION } },
    ]);
  });
});

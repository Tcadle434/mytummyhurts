import { describe, expect, it } from 'vitest';

import { createScanRequestId } from '../id';

describe('createScanRequestId', () => {
  it('creates scan request ids with the expected prefix', () => {
    expect(createScanRequestId()).toMatch(/^scan-request-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('creates distinct ids for separate scan attempts', () => {
    expect(createScanRequestId()).not.toBe(createScanRequestId());
  });
});

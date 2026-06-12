import { mapScanHistorySummary, mapScanRow } from './db.ts';

function baseScanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scan-test',
    title: 'Pepperoni pizza',
    request_id: 'request-test',
    source_type: 'upload',
    scan_category: 'food',
    analysis_status: 'completed',
    created_at: '2026-05-27T12:00:00.000Z',
    completed_at: '2026-05-27T12:00:10.000Z',
    overall_risk_score: 62,
    overall_risk_level: 'medium',
    analysis_metadata: {},
    ...overrides,
  };
}

function emptyDetails(inputs: Record<string, unknown>[] = []) {
  return {
    inputs,
    conditionRisks: [],
    ingredientRisks: [],
    dietEvaluations: [],
    menuItems: [],
    groceryProducts: new Map<string, Record<string, unknown>>(),
  };
}

Deno.test('mapScanRow prefers thumbnail display URLs for storage-backed scan images', () => {
  const signedUrls = new Map([
    ['users/scan-test/photo.jpg', 'https://example.com/signed-photo'],
    ['users/scan-test/thumbnails/photo-thumb.jpg', 'https://example.com/signed-thumbnail'],
  ]);

  const scan = mapScanRow(
    baseScanRow(),
    emptyDetails([
      {
        scan_id: 'scan-test',
        storage_path: 'users/scan-test/photo.jpg',
        thumbnail_storage_path: 'users/scan-test/thumbnails/photo-thumb.jpg',
      },
    ]),
    signedUrls,
  );

  if (scan.imageUri !== 'https://example.com/signed-thumbnail') {
    throw new Error(`Expected signed image URL, received ${scan.imageUri ?? 'undefined'}`);
  }
});

Deno.test('mapScanRow falls back to original display URL when no thumbnail exists', () => {
  const signedUrls = new Map([['users/scan-test/photo.jpg', 'https://example.com/signed-photo']]);
  const scan = mapScanRow(
    baseScanRow(),
    emptyDetails([{ scan_id: 'scan-test', storage_path: 'users/scan-test/photo.jpg' }]),
    signedUrls,
  );

  if (scan.imageUri !== 'https://example.com/signed-photo') {
    throw new Error(`Expected original signed image URL, received ${scan.imageUri ?? 'undefined'}`);
  }
});

Deno.test('mapScanHistorySummary uses thumbnail URLs for scan cards', () => {
  const summary = mapScanHistorySummary(
    baseScanRow(),
    {
      inputs: [
        {
          scan_id: 'scan-test',
          thumbnail_storage_path: 'users/scan-test/thumbnails/photo-thumb.jpg',
        },
      ],
    },
    new Map([['users/scan-test/thumbnails/photo-thumb.jpg', 'https://example.com/signed-thumbnail']]),
  );

  if (summary.imageUri !== 'https://example.com/signed-thumbnail') {
    throw new Error(`Expected thumbnail URL, received ${summary.imageUri ?? 'undefined'}`);
  }
});

Deno.test('mapScanHistorySummary falls back to original URLs when no thumbnail exists', () => {
  const summary = mapScanHistorySummary(
    baseScanRow(),
    {
      inputs: [
        {
          scan_id: 'scan-test',
          storage_path: 'users/scan-test/photo.jpg',
        },
      ],
    },
    new Map([['users/scan-test/photo.jpg', 'https://example.com/signed-photo']]),
  );

  if (summary.imageUri !== 'https://example.com/signed-photo') {
    throw new Error(`Expected original history image URL, received ${summary.imageUri ?? 'undefined'}`);
  }
});

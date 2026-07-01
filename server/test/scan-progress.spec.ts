import { describe, expect, it } from 'vitest';

import type { MenuScanAnalysis, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import {
  buildIngredientsPreview,
  INGREDIENTS_PREVIEW_LIMIT,
  ingredientsPreviewFromExtraction,
  isScanAnalysisStage,
  SCAN_ANALYSIS_STAGES,
} from '../src/scan/scan-progress';

function ingredient(canonicalName: string, rawName = canonicalName) {
  return {
    rawName,
    canonicalName,
    confidence: 'high',
    evidence: 'visible',
  } as StructuredAnalysisV2['visibleIngredients'][number];
}

describe('scan progress stages', () => {
  it('orders stages to mirror the pipeline boundaries', () => {
    expect(SCAN_ANALYSIS_STAGES).toEqual([
      'received',
      'reading_ingredients',
      'scoring',
      'personalizing',
    ]);
  });

  it('accepts only known stages', () => {
    expect(isScanAnalysisStage('scoring')).toBe(true);
    expect(isScanAnalysisStage('extracting')).toBe(false);
    expect(isScanAnalysisStage(null)).toBe(false);
  });
});

describe('buildIngredientsPreview', () => {
  it('keeps the first distinct names up to the limit', () => {
    // Arrange
    const names = ['chicken', 'rice', 'broccoli', 'garlic', 'soy sauce', 'sesame oil'];

    // Act
    const preview = buildIngredientsPreview(names);

    // Assert
    expect(preview).toEqual(['chicken', 'rice', 'broccoli', 'garlic', 'soy sauce']);
    expect(preview).toHaveLength(INGREDIENTS_PREVIEW_LIMIT);
  });

  it('drops blanks and case-insensitive duplicates', () => {
    // Arrange
    const names = [' chicken ', 'Chicken', '', null, undefined, 'rice'];

    // Act
    const preview = buildIngredientsPreview(names);

    // Assert
    expect(preview).toEqual(['chicken', 'rice']);
  });

  it('returns an empty preview when nothing was extracted', () => {
    expect(buildIngredientsPreview([])).toEqual([]);
  });
});

describe('ingredientsPreviewFromExtraction', () => {
  it('previews canonical names for food scans, visible before inferred', () => {
    // Arrange
    const extraction = {
      visibleIngredients: [ingredient('chicken'), ingredient('rice')],
      inferredIngredients: [ingredient('', 'cooking oil'), ingredient('garlic')],
    } as unknown as StructuredAnalysisV2;

    // Act
    const preview = ingredientsPreviewFromExtraction(extraction);

    // Assert
    expect(preview).toEqual(['chicken', 'rice', 'cooking oil', 'garlic']);
  });

  it('previews dish names for menu scans', () => {
    // Arrange
    const extraction = {
      kind: 'menu',
      items: [
        { name: 'Grilled Salmon' },
        { name: 'Fettuccine Alfredo' },
        { name: 'House Salad' },
      ],
    } as unknown as MenuScanAnalysis;

    // Act
    const preview = ingredientsPreviewFromExtraction(extraction);

    // Assert
    expect(preview).toEqual(['Grilled Salmon', 'Fettuccine Alfredo', 'House Salad']);
  });

  it('handles extractions with missing ingredient lists', () => {
    const extraction = {} as unknown as StructuredAnalysisV2;
    expect(ingredientsPreviewFromExtraction(extraction)).toEqual([]);
  });
});

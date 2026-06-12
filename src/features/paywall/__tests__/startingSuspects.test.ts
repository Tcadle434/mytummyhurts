import { describe, expect, it } from 'vitest';

import { deriveStartingSuspects, hasCaseFileSignal } from '../startingSuspects';

const emptyAnswers = {
  conditions: [],
  customConditions: [],
  ingredientSensitivities: [],
  customIngredientSensitivities: [],
  foodCalibrations: {},
};

describe('deriveStartingSuspects', () => {
  it('prioritizes calibration "bad" foods, then declared sensitivities, then condition-linked foods', () => {
    const suspects = deriveStartingSuspects({
      conditions: ['GERD / Acid reflux'],
      customConditions: [],
      ingredientSensitivities: ['Dairy'],
      customIngredientSensitivities: [],
      foodCalibrations: { Garlic: 'bad', Coffee: 'fine' },
    });

    expect(suspects).toEqual(['Garlic', 'Dairy', 'Spicy foods']);
  });

  it('dedupes case-insensitively across sources', () => {
    const suspects = deriveStartingSuspects({
      conditions: ['Lactose intolerance'],
      customConditions: [],
      ingredientSensitivities: ['dairy'],
      customIngredientSensitivities: [],
      foodCalibrations: { Dairy: 'bad' },
    });

    expect(suspects).toEqual(['Dairy']);
  });

  it('ignores fine/unsure calibrations and unknown conditions', () => {
    const suspects = deriveStartingSuspects({
      ...emptyAnswers,
      conditions: ['Unsure, just general discomfort'],
      foodCalibrations: { Coffee: 'fine', Onion: 'unsure' },
    });

    expect(suspects).toEqual([]);
  });

  it('caps at the requested limit', () => {
    const suspects = deriveStartingSuspects(
      {
        ...emptyAnswers,
        foodCalibrations: { Garlic: 'bad', Onion: 'bad', Dairy: 'bad', Tomato: 'bad' },
      },
      3,
    );

    expect(suspects).toHaveLength(3);
  });
});

describe('hasCaseFileSignal', () => {
  it('is false for empty answers', () => {
    expect(hasCaseFileSignal(emptyAnswers)).toBe(false);
  });

  it('is true when a condition exists even without suspects', () => {
    expect(
      hasCaseFileSignal({ ...emptyAnswers, conditions: ['Unsure, just general discomfort'] }),
    ).toBe(true);
  });
});

import { describe, expect, test } from 'vitest';

import { describeProfileForPip } from '../profileSummary';

describe('describeProfileForPip', () => {
  test('returns honest empty copy when nothing is filled in', () => {
    // Arrange
    const input = { conditions: [], sensitivities: [], dietLabels: [] };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe(
      'Not much yet — the more you fill in below, the more personal every scan gets.',
    );
  });

  test('states a full profile in one warm sentence', () => {
    // Arrange
    const input = {
      conditions: ['IBS'],
      sensitivities: ['Dairy', 'Gluten'],
      dietLabels: ['Low FODMAP'],
    };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe(
      "You're living with IBS, keeping an eye on dairy and gluten, and eating low FODMAP.",
    );
  });

  test('rewrites awkward catalog conditions for mid-sentence use', () => {
    // Arrange
    const input = {
      conditions: ['GERD / Acid reflux', 'Unsure, just general discomfort'],
      sensitivities: [],
      dietLabels: [],
    };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe("You're living with GERD and general discomfort.");
  });

  test('caps long lists at two names plus a count', () => {
    // Arrange
    const input = {
      conditions: [],
      sensitivities: ['Dairy', 'Gluten', 'Garlic', 'Tomato'],
      dietLabels: [],
    };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe("You're keeping an eye on dairy, gluten, and 2 more.");
  });

  test('counts multiple diet goals instead of listing them', () => {
    // Arrange
    const input = {
      conditions: [],
      sensitivities: [],
      dietLabels: ['Vegan', 'Low FODMAP'],
    };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe("You're working toward 2 diet goals.");
  });

  test('preserves acronym casing mid-sentence', () => {
    // Arrange
    const input = { conditions: ['IBS'], sensitivities: [], dietLabels: [] };

    // Act
    const summary = describeProfileForPip(input);

    // Assert
    expect(summary).toBe("You're living with IBS.");
  });
});

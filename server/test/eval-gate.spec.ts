import { describe, expect, it } from 'vitest';

import { evaluateEvalGate } from '../scripts/eval/eval-gate.mjs';

function resultsWithFailures(total: number, failed: number) {
  return Array.from({ length: total }, (_, index) => ({
    validation: { passed: index >= failed },
    runs: [{ score: 50 }],
  }));
}

describe('scan eval release gate', () => {
  it('accepts 32 of 36 expectations at the requested release ratio', () => {
    expect(evaluateEvalGate(resultsWithFailures(36, 4), '32/36')).toMatchObject({
      passed: 32,
      failed: 4,
      requiredPasses: 32,
      accepted: true,
    });
  });

  it('rejects 31 of 36 expectations at the requested release ratio', () => {
    expect(evaluateEvalGate(resultsWithFailures(36, 5), '32/36').accepted).toBe(false);
  });

  it('requires 32 passes when a release rotation has 35 expectations', () => {
    expect(evaluateEvalGate(resultsWithFailures(35, 3), '32/36')).toMatchObject({
      requiredPasses: 32,
      accepted: true,
    });
    expect(evaluateEvalGate(resultsWithFailures(35, 4), '32/36').accepted).toBe(false);
  });

  it('rejects operational scan failures even when the quality budget is not exhausted', () => {
    const results = resultsWithFailures(36, 1);
    results[0].runs = [{ error: { code: 'request_timeout' } }];

    expect(evaluateEvalGate(results, '32/36')).toMatchObject({
      operationalFailures: 1,
      accepted: false,
    });
  });

  it('rejects an invalid pass ratio', () => {
    expect(() => evaluateEvalGate([], '37/36')).toThrow(/between/);
  });
});

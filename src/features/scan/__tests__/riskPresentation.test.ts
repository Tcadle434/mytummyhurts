import { describe, expect, it } from 'vitest';

import { presentRisk } from '../riskPresentation';
import type { ScanRecord } from '../../../types/domain';

function scanFixture(overrides: {
  level?: ScanRecord['overallRiskLevel'];
  clarity?: 'clear' | 'unclear';
  scoringConfidence?: 'low' | 'medium' | 'high';
  inferredLowConfidence?: boolean;
}): Pick<ScanRecord, 'overallRiskLevel' | 'scoringConfidence' | 'structuredAnalysis'> {
  return {
    overallRiskLevel: overrides.level ?? 'low',
    scoringConfidence: overrides.scoringConfidence ?? 'medium',
    structuredAnalysis: {
      dishName: 'Test bowl',
      dishConfidence: 'medium',
      clarity: overrides.clarity ?? 'clear',
      unclearReason: overrides.clarity === 'unclear' ? 'the sauce was hard to read' : undefined,
      components: [],
      visibleIngredients: [],
      inferredIngredients: overrides.inferredLowConfidence
        ? [{ rawName: 'aioli', canonicalName: 'aioli', confidence: 'low', evidence: 'inferred' }]
        : [],
      prepStyle: [],
      notes: [],
      model: 'test',
      promptVersion: 'test',
      imageDetail: 'high',
    },
  };
}

describe('presentRisk', () => {
  it('never suppresses medium or high risk labels', () => {
    expect(presentRisk(scanFixture({ level: 'high', clarity: 'unclear' }))).toEqual({});
    expect(presentRisk(scanFixture({ level: 'medium', scoringConfidence: 'low' }))).toEqual({});
  });

  it('leaves confident low-risk results alone', () => {
    expect(presentRisk(scanFixture({ level: 'low' }))).toEqual({});
  });

  it('floors unclear extractions and names the unknown', () => {
    const presentation = presentRisk(scanFixture({ level: 'low', clarity: 'unclear' }));
    expect(presentation.levelLabelOverride).toBe('Likely okay');
    expect(presentation.cautionNote).toContain('the sauce was hard to read');
  });

  it('floors low scoring confidence', () => {
    expect(presentRisk(scanFixture({ level: 'low', scoringConfidence: 'low' })).levelLabelOverride).toBe(
      'Likely okay',
    );
  });

  it('floors low-confidence inferred ingredients and names them', () => {
    const presentation = presentRisk(scanFixture({ level: 'low', inferredLowConfidence: true }));
    expect(presentation.cautionNote).toContain('aioli');
  });
});

describe('verdictForRisk', () => {
  it('translates score bands into decisions', async () => {
    const { verdictForRisk } = await import('../riskPresentation');
    expect(verdictForRisk(20)).toContain('easy on your gut');
    expect(verdictForRisk(45)).toContain('small amount');
    expect(verdictForRisk(58)).toContain('caution');
    expect(verdictForRisk(70)).toContain('rough');
    expect(verdictForRisk(85)).toContain('skip');
  });

  it('lets the uncertainty caution note override comfort', async () => {
    const { verdictForRisk } = await import('../riskPresentation');
    expect(verdictForRisk(20, 'Likely okay — but the sauce is a wildcard.')).toContain('wildcard');
  });
});

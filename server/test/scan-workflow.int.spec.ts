import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module';
import { LlmModule } from '../src/llm/llm.module';
import { buildUserProfileFromSeed } from '../src/scan/engine/scoring';
import { fallbackExtractionFromText } from '../src/scan/engine/scoring';
import { computeScanResultFromStructured } from '../src/scan/engine/scoring';
import { ScanModule } from '../src/scan/scan.module';
import { ScanWorkflowService } from '../src/scan/workflow/scan-workflow.service';

// No OPENAI_API_KEY in tests => extraction falls back to the deterministic
// dish-library extraction, so the whole graph is reproducible offline.
describe('scan workflow (deterministic graph)', () => {
  it('produces the SAME score as calling the engine directly (graph adds no drift)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, LlmModule, ScanModule],
    }).compile();
    const workflow = moduleRef.get(ScanWorkflowService);

    const profile = buildUserProfileFromSeed({
      userId: 'wf-test',
      knownConditions: ['IBS', 'GERD / Acid reflux'],
      knownIngredientSensitivities: ['Garlic'],
      commonSymptoms: ['Bloating', 'Gas'],
      symptomFrequency: 'A few times a week',
      symptomSeverityBaseline: 'Moderate',
      mealContexts: [],
      currentEatingPatterns: [],
      lifestyleFactors: [],
      foodsToReintroduce: [],
    });

    const text = 'grilled chicken with garlic butter and white rice';
    const result = await workflow.run({
      userId: 'wf-test',
      kind: 'text',
      text,
      profile,
      insights: [],
    });

    // Engine computed independently on the identical fallback extraction.
    const expected = computeScanResultFromStructured(fallbackExtractionFromText(text), profile, []);

    expect(result.finalResult.overallRiskScore).toBe(expected.overallRiskScore);
    expect(result.finalResult.overallRiskLevel).toBe(expected.overallRiskLevel);
    // RAG influence is off -> final === base, byte-identical to the engine.
    expect(result.finalResult.overallRiskScore).toBe(result.baseResult.overallRiskScore);
    expect(result.scanCategory).toBe('food');
  });
});

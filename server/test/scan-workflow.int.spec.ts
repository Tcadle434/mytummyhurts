import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module';
import type { LlmProvider } from '../src/llm/llm-provider.interface';
import { LlmModule } from '../src/llm/llm.module';
import type { RankedCandidate } from '../src/rag/reranker';
import type { RagRetrievalService } from '../src/rag/retrieval.service';
import type { IngredientInsight, MenuScanAnalysis, StructuredAnalysisV2 } from '../src/scan/engine/domain';
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

  it('retrieves RAG evidence and uses adjudicated bands before scoring when enabled', async () => {
    const profile = buildUserProfileFromSeed({
      userId: 'wf-adj',
      knownConditions: ['IBS'],
      knownIngredientSensitivities: [],
      commonSymptoms: [],
      symptomFrequency: 'Mild',
      symptomSeverityBaseline: 'Mild',
      mealContexts: [],
      currentEatingPatterns: [],
      lifestyleFactors: [],
      foodsToReintroduce: [],
    });
    profile.stomachProfile.metadata.profileConfidenceLevel = 'confident';

    const extraction: StructuredAnalysisV2 = {
      ...fallbackExtractionFromText('sub sandwich with wheat bread'),
      dishName: 'sub sandwich',
      visibleIngredients: [
        {
          rawName: 'wheat bread',
          canonicalName: 'bread',
          confidence: 'high',
          component: 'bread',
          evidence: 'visible',
          role: 'base',
          prominence: 'primary',
        },
      ],
      conditionSeverities: [{ condition: 'IBS', band: 'moderate', drivers: ['bread'], rationale: 'Generic wheat watch-out.' }],
      riskModifiers: [{ key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bread' }],
    };
    const insight: IngredientInsight = {
      id: 'wheat-safe',
      ingredientName: 'wheat',
      triggerScore: 2,
      safeScore: 24,
      combinedRiskScore: 28,
      confidenceLevel: 'high',
      patternStrength: 'weak',
      linkedConditions: ['IBS'],
      supportingEvidenceCount: 10,
      positiveEvidenceCount: 10,
      negativeEvidenceCount: 0,
      sourceBreakdown: {
        declared: false,
        science: true,
        personal: true,
        positiveEvidenceCount: 10,
        negativeEvidenceCount: 0,
      },
      lastRecomputedAt: '2026-06-24T00:00:00.000Z',
      summary: 'Wheat has appeared mostly around calmer daily reports.',
    };
    let retrievalQuery: unknown = null;
    let adjudicationInputPersonalEvidence = 0;
    const chunk: RankedCandidate = {
      chunkId: 'chunk-wheat',
      documentId: 'doc-wheat',
      content: 'Wheat can contribute fructans for IBS.',
      source: 'Curated reference',
      title: 'IBS and wheat',
      url: null,
      headingPath: ['IBS'],
      conditionTags: ['IBS'],
      ingredientTags: ['wheat'],
      direction: 'raises',
      vectorScore: 0.5,
      keywordScore: 0.8,
      hybridScore: 0.62,
      rerankScore: 0.85,
    };
    const fakeRetrieval = {
      async retrieve(query: unknown) {
        retrievalQuery = query;
        return { runId: 'rag-run-1', chunks: [chunk] };
      },
    } as unknown as RagRetrievalService;
    const fakeLlm = {
      name: 'fake',
      async extractText() {
        return { result: extraction, audits: [] };
      },
      async adjudicateScanRisk(input: { personalEvidence: unknown[] }) {
        adjudicationInputPersonalEvidence = input.personalEvidence.length;
        return {
          result: {
            conditionSeverities: [
              {
                condition: 'IBS',
                genericBand: 'moderate',
                personalizedBand: 'mild',
                finalBand: 'mild',
                drivers: ['bread'],
                protectiveEvidence: ['10 calm wheat days'],
                citationChunkIds: ['chunk-wheat'],
                personalEvidenceUsed: ['10 calm wheat days'],
                confidence: 'high',
                rationale: 'The user has repeated calm evidence with wheat.',
              },
            ],
          },
          audits: [],
        };
      },
    } as unknown as LlmProvider;
    const workflow = new ScanWorkflowService(
      fakeLlm,
      new ConfigService({ SCAN_RISK_ADJUDICATION_ENABLED: 'true', RAG_RETRIEVAL_ENABLED: 'true' }),
      fakeRetrieval,
    );

    const result = await workflow.run({
      userId: 'wf-adj',
      scanId: 'scan-adj-1',
      kind: 'text',
      text: 'sub sandwich',
      scanCategory: 'food',
      profile,
      insights: [insight],
    });

    expect(retrievalQuery).toMatchObject({ scanId: 'scan-adj-1', userId: 'wf-adj', conditions: ['IBS'] });
    expect(adjudicationInputPersonalEvidence).toBe(1);
    expect(result.finalResult.structuredAnalysis.conditionSeverities?.[0].band).toBe('mild');
    expect(result.finalResult.structuredAnalysis.riskAdjudication?.ragRetrievalRunId).toBe('rag-run-1');
    expect(result.finalResult.evidenceCitations?.[0].chunkId).toBe('chunk-wheat');
    expect(result.finalResult.overallRiskScore).toBeLessThan(37);
  });

  it('skips risk adjudication for menu scans', async () => {
    let retrievalCalled = false;
    let adjudicationCalled = false;
    const menu: MenuScanAnalysis = {
      kind: 'menu',
      menuTitle: 'Test Menu',
      menuConfidence: 'high',
      inputPageCount: 1,
      items: [],
      bestOptions: [],
      eatWithCautionOptions: [],
      worstOptions: [],
      summary: 'No items.',
    };
    const fakeRetrieval = {
      async retrieve() {
        retrievalCalled = true;
        return { runId: null, chunks: [] };
      },
    } as unknown as RagRetrievalService;
    const fakeLlm = {
      name: 'fake',
      async extractMenu() {
        return { result: menu, audits: [] };
      },
      async adjudicateScanRisk() {
        adjudicationCalled = true;
        return { result: { conditionSeverities: [] }, audits: [] };
      },
    } as unknown as LlmProvider;
    const workflow = new ScanWorkflowService(
      fakeLlm,
      new ConfigService({ SCAN_RISK_ADJUDICATION_ENABLED: 'true', RAG_RETRIEVAL_ENABLED: 'true' }),
      fakeRetrieval,
    );

    const result = await workflow.run({
      userId: 'wf-menu',
      scanId: 'scan-menu-1',
      kind: 'menu',
      imageUrls: ['http://image.test/menu.png'],
      scanCategory: 'menu',
      profile: null,
      insights: [],
    });

    expect(result.scanCategory).toBe('menu');
    expect(retrievalCalled).toBe(false);
    expect(adjudicationCalled).toBe(false);
  });
});

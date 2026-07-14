import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScanAnalysisExecutorService } from '../src/scan/scan-analysis-executor.service';
import type { ConcernV1ShadowRun } from '../src/scan/concern-v1/domain';
import type { ScanResult, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import type { ImageScanJobPayload, ScanAnalysisJobRow } from '../src/scan/scan-analysis.types';

const { runConcernV1Shadow } = vi.hoisted(() => ({
  runConcernV1Shadow: vi.fn(),
}));

vi.mock('../src/scan/concern-v1/openai', () => ({ runConcernV1Shadow }));

const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalConcernShadowEnabled = process.env.CONCERN_V1_SHADOW_ENABLED;

afterEach(() => {
  if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  if (originalConcernShadowEnabled === undefined) delete process.env.CONCERN_V1_SHADOW_ENABLED;
  else process.env.CONCERN_V1_SHADOW_ENABLED = originalConcernShadowEnabled;
  runConcernV1Shadow.mockReset();
});

describe('concern v1 shadow tracing', () => {
  it('starts shadow work only after the scan completion CAS succeeds', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.CONCERN_V1_SHADOW_ENABLED = 'on';
    const extraction: StructuredAnalysisV2 = {
      dishName: 'Meal',
      dishConfidence: 'high',
      clarity: 'clear',
      components: [],
      visibleIngredients: [],
      inferredIngredients: [],
      prepStyle: [],
      notes: [],
      model: 'test',
      promptVersion: 'test',
      imageDetail: 'high',
    };
    const result: ScanResult = {
      dishName: 'Meal',
      overallRiskScore: 20,
      overallRiskLevel: 'low',
      conditionRiskScores: {},
      possibleTriggers: [],
      interpretation: 'Low concern.',
      conditionRisks: [],
      ingredientRisks: [],
      dietEvaluations: [],
      structuredAnalysis: extraction,
    };
    const workflow = {
      run: vi.fn().mockResolvedValue({
        scanCategory: 'food',
        extraction,
        baseResult: result,
        finalResult: result,
        audits: [],
      }),
    };
    const job: ScanAnalysisJobRow = {
      id: 'job',
      scan_id: 'scan',
      user_id: 'user',
      request_id: 'request',
      status: 'running',
      payload: {},
      reserved_tokens_remaining: 1,
      attempt_count: 1,
      error_code: null,
      last_error: null,
    };
    const payload: ImageScanJobPayload = {
      kind: 'image',
      imageStoragePaths: ['image.jpg'],
      sourceType: 'camera',
      scanCategory: 'food',
      autoClassify: false,
    };
    const events: string[] = [];
    const buildExecutor = (completion: boolean | Error) => new ScanAnalysisExecutorService(
      { complete: vi.fn() } as never,
      workflow as never,
      { enqueue: vi.fn().mockResolvedValue(undefined) } as never,
      {
        readImageDataUrl: vi.fn().mockResolvedValue('data:image/jpeg;base64,eA=='),
        signUrl: vi.fn().mockResolvedValue('https://example.test/image.jpg'),
      } as never,
      {} as never,
      { getInsights: vi.fn().mockResolvedValue({ profile: null, insights: [] }) } as never,
      { recordScanTrace: vi.fn().mockResolvedValue(null) } as never,
      { setStage: vi.fn().mockResolvedValue(undefined) } as never,
      {
        complete: vi.fn().mockImplementation(async () => {
          events.push('complete');
          if (completion instanceof Error) throw completion;
          return completion;
        }),
      } as never,
    );
    const executeImage = (executor: ScanAnalysisExecutorService) => (
      executor as unknown as {
        executeImage(job: ScanAnalysisJobRow, payload: ImageScanJobPayload): Promise<string>;
      }
    ).executeImage(job, payload);
    runConcernV1Shadow.mockImplementation(() => {
      events.push('shadow');
      return new Promise(() => {});
    });

    await executeImage(buildExecutor(false));
    expect(runConcernV1Shadow).not.toHaveBeenCalled();
    events.length = 0;

    await expect(executeImage(buildExecutor(new Error('persistence failed'))))
      .rejects.toThrow('persistence failed');
    expect(runConcernV1Shadow).not.toHaveBeenCalled();
    events.length = 0;

    await executeImage(buildExecutor(true));
    expect(runConcernV1Shadow).toHaveBeenCalledOnce();
    expect(events).toEqual(['complete', 'shadow']);
  });

  it('records the served scan immediately and traces shadow work after it settles', async () => {
    const recordScanTrace = vi.fn().mockResolvedValue(null);
    const executor = new ScanAnalysisExecutorService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { recordScanTrace } as never,
      undefined as never,
      undefined as never,
    );
    let resolveShadow!: (run: ConcernV1ShadowRun) => void;
    const shadow = new Promise<ConcernV1ShadowRun>((resolve) => {
      resolveShadow = resolve;
    });
    const record = (
      executor as unknown as {
        recordCompletedScanTraces(input: Record<string, unknown>, shadow: Promise<ConcernV1ShadowRun>): Promise<void>;
      }
    ).recordCompletedScanTraces.bind(executor);

    await record({
      userId: 'user',
      scanId: 'scan',
      operation: 'scan_extract',
      scanCategory: 'food',
      promptVersion: 'extract_v1',
      baseScore: 20,
      finalScore: 20,
      audits: [],
    }, shadow);

    expect(recordScanTrace).toHaveBeenCalledTimes(1);
    expect(recordScanTrace).toHaveBeenLastCalledWith(expect.objectContaining({
      operation: 'scan_extract',
      finalScore: 20,
    }));

    resolveShadow({
      result: {
        engineVersion: 'concern_v1',
        evidenceVersion: 'evidence_v1',
        status: 'completed',
        conditions: [],
        subjects: [{
          subjectId: 'scan',
          subjectName: 'Meal',
          score: 50,
          band: 'moderate',
          confidence: 'high',
          drivingConditionKey: 'gerd',
          drivingConditionLabel: 'GERD / Acid reflux',
          conditions: [],
        }],
        generatedAt: '2026-07-13T00:00:00.000Z',
      },
      audits: [],
    });

    await vi.waitFor(() => expect(recordScanTrace).toHaveBeenCalledTimes(2));
    expect(recordScanTrace).toHaveBeenLastCalledWith(expect.objectContaining({
      operation: 'scan_concern_shadow',
      finalScore: 50,
      status: 'completed',
      ragSummary: {
        concernV1: expect.objectContaining({ status: 'completed' }),
      },
    }));
  });

  it('records a failed shadow without borrowing the served score', async () => {
    const recordScanTrace = vi.fn().mockResolvedValue(null);
    const executor = new ScanAnalysisExecutorService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      { recordScanTrace } as never,
      undefined as never,
      undefined as never,
    );
    const record = (
      executor as unknown as {
        recordCompletedScanTraces(input: Record<string, unknown>, shadow: Promise<ConcernV1ShadowRun>): Promise<void>;
      }
    ).recordCompletedScanTraces.bind(executor);

    await record({
      userId: 'user',
      scanId: 'scan',
      operation: 'scan_extract',
      scanCategory: 'food',
      promptVersion: 'extract_v1',
      baseScore: 20,
      finalScore: 62,
      audits: [],
    }, Promise.resolve({
      result: {
        engineVersion: 'concern_v1',
        evidenceVersion: 'evidence_v1',
        status: 'failed',
        stage: 'verification',
        code: 'concern_v1_stage_failed',
      },
      audits: [],
    }));

    await vi.waitFor(() => expect(recordScanTrace).toHaveBeenCalledTimes(2));
    expect(recordScanTrace).toHaveBeenLastCalledWith(expect.objectContaining({
      operation: 'scan_concern_shadow',
      finalScore: null,
      status: 'failed',
    }));
  });
});

import { describe, expect, it, vi } from 'vitest';

import { ScanAnalysisExecutorService } from '../src/scan/scan-analysis-executor.service';
import type { ConcernV1ShadowRun } from '../src/scan/concern-v1/domain';

describe('concern v1 shadow tracing', () => {
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

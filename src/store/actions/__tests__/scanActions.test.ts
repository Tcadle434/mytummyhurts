import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../services/api/errors';
import type { AppStoreGet, AppStoreSet, AppStoreState } from '../../types';
import { createScanActions } from '../scanActions';

const apiClientMock = vi.hoisted(() => ({
  getScanAnalysisResult: vi.fn(),
}));

vi.mock('../../../config/env', () => ({ isLiveBackendConfigured: true }));
vi.mock('../../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../../services/api/client', () => ({ apiClient: apiClientMock }));
vi.mock('../../../services/query/client', () => ({
  queryClient: { invalidateQueries: vi.fn(), cancelQueries: vi.fn(), removeQueries: vi.fn() },
}));
vi.mock('../../../services/toast', () => ({ showToast: vi.fn() }));

function resumableState() {
  return {
    authUser: { id: 'user-1' },
    activeScanAnalysis: {
      ok: true,
      scanId: 'scan-1',
      requestId: 'request-1',
      status: 'processing',
      deduped: false,
      tokensRemaining: 4,
    },
    scanAnalysisInFlight: false,
    scans: [],
    billing: {
      selectedPlan: 'annual',
      subscriptionStatus: 'active',
      tokensRemaining: 4,
      monthlyAllowance: 1000,
      topUpOptions: [],
    },
    profile: null,
    insights: [],
    conditionInsights: [],
  } as unknown as AppStoreState;
}

function actionsFor(state: AppStoreState) {
  const set: AppStoreSet = (patch) => {
    Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  };
  const get: AppStoreGet = () => state;
  return createScanActions(set, get);
}

describe('scan analysis polling', () => {
  beforeEach(() => {
    apiClientMock.getScanAnalysisResult.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates a completed result when persisted analysis resumes', async () => {
    const state = resumableState();
    apiClientMock.getScanAnalysisResult.mockResolvedValue({
      ok: true,
      scanId: 'scan-1',
      requestId: 'request-1',
      status: 'completed',
      stage: 'personalizing',
      ingredientsPreview: [],
      error: null,
      result: {
        scanId: 'scan-1',
        deduped: false,
        learningSyncStatus: 'updated',
        tokensRemaining: 3,
        scan: { id: 'scan-1' },
        billing: { ...state.billing, tokensRemaining: 3 },
        profile: null,
        insights: [],
        conditionInsights: [],
      },
    });

    await actionsFor(state).resumeActiveScanAnalysis();

    expect(state.activeScanAnalysis).toBeNull();
    expect(state.scanAnalysisInFlight).toBe(false);
    expect(state.scans).toEqual([{ id: 'scan-1' }]);
    expect(state.billing.tokensRemaining).toBe(3);
  });

  it('discards persisted analysis when the result no longer exists', async () => {
    const state = resumableState();
    apiClientMock.getScanAnalysisResult.mockRejectedValue(
      new ApiError('Scan not found.', { status: 404, code: 'scan_not_found' }),
    );

    await actionsFor(state).resumeActiveScanAnalysis();

    expect(state.activeScanAnalysis).toBeNull();
    expect(state.scanAnalysisInFlight).toBe(false);
  });

  it('retains persisted analysis after a retryable transport failure', async () => {
    vi.useFakeTimers();
    const state = resumableState();
    apiClientMock.getScanAnalysisResult.mockRejectedValue(
      new ApiError('Offline.', { code: 'network_retryable' }),
    );

    const resume = actionsFor(state).resumeActiveScanAnalysis();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    await resume;

    expect(state.activeScanAnalysis?.scanId).toBe('scan-1');
    expect(state.scanAnalysisInFlight).toBe(false);
  });
});

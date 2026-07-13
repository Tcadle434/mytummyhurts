import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { CostCapService } from '../common/cost-cap.service';
import { InsightsService } from '../insights/insights.service';
import { StorageService } from '../storage/storage.service';
import { isScanAnalysisStage, type ScanStageDetail } from './scan-progress';
import { ScanAnalysisExecutorService } from './scan-analysis-executor.service';
import { ScanAnalysisJobService, type ScanAnalysisStateRow } from './scan-analysis-job.service';
import type {
  AnalyzeBarcodeRequest,
  AnalyzeImageRequest,
  AnalyzeResult,
  ScanAnalysisPublicStatus,
  ScanAnalysisResultSnapshot,
  ScanAnalysisStartResult,
} from './scan-analysis.types';
import { ScanCrudService } from './scan-crud.service';

export type {
  AnalyzeBarcodeRequest,
  AnalyzeImageRequest,
  AnalyzeResult,
  ScanAnalysisResultSnapshot,
  ScanAnalysisStartResult,
} from './scan-analysis.types';

const LEGACY_WAIT_TIMEOUT_MS = 7 * 60_000;
const LEGACY_WAIT_POLL_MS = 500;
const MAX_SCAN_IMAGES = 8;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function publicStatus(state: Pick<ScanAnalysisStateRow, 'analysis_status' | 'job_status'>): ScanAnalysisPublicStatus {
  if (state.analysis_status === 'completed') return 'completed';
  if (state.analysis_status === 'failed' || state.job_status === 'failed') return 'failed';
  return state.job_status === 'pending' ? 'queued' : 'processing';
}

function throwStoredFailure(errorCode: string | null): never {
  throw new Error(errorCode === 'openai_timeout' ? 'openai_timeout' : 'openai_request_failed');
}

@Injectable()
export class ScanAnalysisService {
  constructor(
    private readonly jobs: ScanAnalysisJobService,
    private readonly executor: ScanAnalysisExecutorService,
    private readonly storage: StorageService,
    private readonly crud: ScanCrudService,
    private readonly insights: InsightsService,
    private readonly costCap: CostCapService,
  ) {}

  private async buildResponse(
    userId: string,
    scanId: string,
    deduped: boolean,
    tokensRemaining: number,
  ): Promise<AnalyzeResult> {
    const [{ scan }, context] = await Promise.all([
      this.crud.getScan(userId, scanId),
      this.insights.getInsights(userId),
    ]);
    return {
      scanId,
      deduped,
      learningSyncStatus: 'queued',
      tokensRemaining,
      scan,
      billing: context.billing,
      profile: context.profile,
      insights: context.insights,
      conditionInsights: context.conditionInsights,
    };
  }

  private validateImagePaths(userId: string, imagePaths: string[]) {
    if (!imagePaths.length) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'At least one scan image is required.',
      });
    }
    if (imagePaths.length > MAX_SCAN_IMAGES) {
      throw new BadRequestException({
        code: 'validation_error',
        message: `A scan can include at most ${MAX_SCAN_IMAGES} images.`,
      });
    }
    imagePaths.forEach((path) => this.storage.assertUserOwnsKey(userId, path));
  }

  async startImage(req: AnalyzeImageRequest): Promise<ScanAnalysisStartResult> {
    await this.costCap.assertWithinCap(req.userId);
    const existingPaths = [...(req.imagePaths ?? [])];
    existingPaths.forEach((path) => this.storage.assertUserOwnsKey(req.userId, path));
    const createdPaths: string[] = [];

    try {
      const uploads = await Promise.allSettled(
        (req.imageDataUrls ?? []).map((dataUrl, index) =>
          this.storage.putInlineImage(req.userId, dataUrl, index),
        ),
      );
      for (const upload of uploads) {
        if (upload.status === 'fulfilled') createdPaths.push(upload.value);
      }
      const failedUpload = uploads.find((upload) => upload.status === 'rejected');
      if (failedUpload?.status === 'rejected') {
        throw failedUpload.reason;
      }
      const imageStoragePaths = [...existingPaths, ...createdPaths];
      this.validateImagePaths(req.userId, imageStoragePaths);
      const scanCategory = req.scanCategory ?? 'food';
      const sourceType = req.sourceType?.trim() || 'camera';
      const begin = await this.jobs.begin({
        userId: req.userId,
        requestId: req.requestId,
        sourceType,
        imageStoragePath: imageStoragePaths[0],
        scanCategory,
        localDate: req.localDate,
        timezone: req.timezone,
        payload: {
          kind: 'image',
          imageStoragePaths,
          sourceType,
          scanCategory,
          autoClassify: !req.scanCategory,
        },
      });
      if (begin.error_code) throwStoredFailure(String(begin.error_code));
      if (begin.deduped && createdPaths.length) {
        await this.storage.removeKeys(createdPaths).catch(() => undefined);
      }
      return {
        ok: true,
        scanId: String(begin.scan_id),
        requestId: req.requestId,
        status: begin.analysis_status === 'completed'
          ? 'completed'
          : begin.analysis_status === 'failed'
            ? 'failed'
            : begin.job_status === 'pending'
              ? 'queued'
              : 'processing',
        deduped: Boolean(begin.deduped),
        tokensRemaining: Number(begin.tokens_remaining),
      };
    } catch (error) {
      if (createdPaths.length) await this.storage.removeKeys(createdPaths).catch(() => undefined);
      throw error;
    }
  }

  async startBarcode(req: AnalyzeBarcodeRequest): Promise<ScanAnalysisStartResult> {
    await this.costCap.assertWithinCap(req.userId);
    const barcode = req.barcode.trim();
    if (!barcode) {
      throw new BadRequestException({ code: 'validation_error', message: 'A barcode is required.' });
    }
    const begin = await this.jobs.begin({
      userId: req.userId,
      requestId: req.requestId,
      sourceType: req.sourceType?.trim() || 'barcode',
      scanCategory: 'grocery',
      localDate: req.localDate,
      timezone: req.timezone,
      payload: {
        kind: 'barcode',
        barcode,
        sourceType: req.sourceType?.trim() || 'barcode',
        scanCategory: 'grocery',
      },
    });
    if (begin.error_code) throwStoredFailure(String(begin.error_code));
    return {
      ok: true,
      scanId: String(begin.scan_id),
      requestId: req.requestId,
      status: begin.analysis_status === 'completed'
        ? 'completed'
        : begin.analysis_status === 'failed'
          ? 'failed'
          : begin.job_status === 'pending'
            ? 'queued'
            : 'processing',
      deduped: Boolean(begin.deduped),
      tokensRemaining: Number(begin.tokens_remaining),
    };
  }

  async getResult(userId: string, scanId: string): Promise<ScanAnalysisResultSnapshot> {
    const state = await this.jobs.getState(userId, scanId);
    if (!state) {
      throw new NotFoundException({ code: 'scan_not_found', message: 'Scan not found.' });
    }
    const status = publicStatus(state);
    const detail = (state.analysis_stage_detail ?? {}) as ScanStageDetail;
    const ingredientsPreview = Array.isArray(detail.ingredientsPreview)
      ? detail.ingredientsPreview.filter((value): value is string => typeof value === 'string')
      : [];
    const errorCode = state.job_error_code ?? state.analysis_error_code;
    return {
      ok: true,
      scanId,
      requestId: state.request_id,
      status,
      stage: isScanAnalysisStage(state.analysis_stage) ? state.analysis_stage : null,
      ingredientsPreview,
      result: status === 'completed'
        ? await this.buildResponse(
            userId,
            scanId,
            false,
            Number(state.reserved_tokens_remaining),
          )
        : null,
      error: status === 'failed'
        ? errorCode === 'openai_timeout'
          ? {
              code: 'request_timeout',
              message: 'The AI scan timed out. Please try again.',
              retryable: true,
            }
          : {
              code: 'ai_request_failed',
              message: 'The AI service could not complete the request. Please try again.',
              retryable: true,
            }
        : null,
    };
  }

  private async waitForCompletion(
    userId: string,
    start: ScanAnalysisStartResult,
  ): Promise<AnalyzeResult> {
    if (start.status === 'completed') {
      return this.buildResponse(userId, start.scanId, start.deduped, start.tokensRemaining);
    }
    if (start.status === 'failed') throwStoredFailure(null);

    const [claimed] = await this.jobs.claimScan(start.scanId, `scan-request-${process.pid}`);
    if (claimed) await this.executor.execute(claimed);

    const deadline = Date.now() + LEGACY_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const snapshot = await this.getResult(userId, start.scanId);
      if (snapshot.status === 'completed' && snapshot.result) {
        return { ...snapshot.result, deduped: start.deduped };
      }
      if (snapshot.status === 'failed') {
        throwStoredFailure(snapshot.error?.code === 'request_timeout' ? 'openai_timeout' : null);
      }
      await sleep(LEGACY_WAIT_POLL_MS);
    }
    throw new Error('openai_timeout');
  }

  async analyzeImage(req: AnalyzeImageRequest): Promise<AnalyzeResult> {
    return this.waitForCompletion(req.userId, await this.startImage(req));
  }

  async analyzeBarcode(req: AnalyzeBarcodeRequest): Promise<AnalyzeResult> {
    return this.waitForCompletion(req.userId, await this.startBarcode(req));
  }
}

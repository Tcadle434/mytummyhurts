import { Injectable, Logger } from '@nestjs/common';

import { LearningJobService } from '../learning/learning-job.service';
import { StorageService } from '../storage/storage.service';
import { TraceService } from '../trace/trace.service';
import { InsightsService } from '../insights/insights.service';
import { buildDayLoadContext } from './engine/day-load';
import type { IngredientInsight, ScanDayLoad, ScanResult, UserProfile } from './engine/domain';
import { PROMPT_VERSION as EXTRACTION_PROMPT_VERSION, type OpenAiAuditLog } from './engine/openai';
import { buildFoodCompletionInput, buildMenuCompletionInput } from './scan-payload';
import { ScanAnalysisJobService } from './scan-analysis-job.service';
import {
  scanAnalysisJobPayloadSchema,
  type ImageScanJobPayload,
  type ScanAnalysisJobRow,
} from './scan-analysis.types';
import { ScanCrudService } from './scan-crud.service';
import type { ScanStageCallback } from './scan-progress';
import { ScanProgressService } from './scan-progress.service';
import { ScanReservationService } from './scan-reservation.service';
import { ScanWorkflowService } from './workflow/scan-workflow.service';

function failureCode(error: unknown): 'openai_timeout' | 'openai_request_failed' {
  return error instanceof Error && error.message === 'openai_timeout'
    ? 'openai_timeout'
    : 'openai_request_failed';
}

function failureMessage(code: 'openai_timeout' | 'openai_request_failed') {
  return code === 'openai_timeout'
    ? 'The AI scan timed out.'
    : 'The AI service could not complete the scan.';
}

const JOB_HEARTBEAT_INTERVAL_MS = 60_000;

@Injectable()
export class ScanAnalysisExecutorService {
  private readonly logger = new Logger('ScanAnalysisExecutor');

  constructor(
    private readonly reservation: ScanReservationService,
    private readonly workflow: ScanWorkflowService,
    private readonly learning: LearningJobService,
    private readonly storage: StorageService,
    private readonly crud: ScanCrudService,
    private readonly insights: InsightsService,
    private readonly trace: TraceService,
    private readonly progress: ScanProgressService,
    private readonly jobs: ScanAnalysisJobService,
  ) {}

  private stageNotifier(userId: string, scanId: string): ScanStageCallback {
    return (stage, detail) => {
      void this.progress.setStage(userId, scanId, stage, detail).catch((error) => {
        this.logger.warn(`progress update failed for scan ${scanId}: ${(error as Error).message}`);
      });
    };
  }

  private async recordScanTraceSafely(input: Parameters<TraceService['recordScanTrace']>[0]) {
    try {
      await this.trace.recordScanTrace(input);
    } catch (error) {
      this.logger.error(
        `scan trace could not be recorded for ${input.scanId}: ${(error as Error).message}`,
      );
    }
  }

  private async recordFailedScanTrace(
    job: ScanAnalysisJobRow,
    scanCategory: 'food' | 'menu' | 'grocery',
    error: unknown,
  ): Promise<void> {
    const carrier = (error ?? {}) as { audit?: OpenAiAuditLog; audits?: OpenAiAuditLog[] };
    const audits = [
      ...(Array.isArray(carrier.audits) ? carrier.audits : []),
      ...(carrier.audit ? [carrier.audit] : []),
    ];
    await this.recordScanTraceSafely({
      userId: job.user_id,
      scanId: job.scan_id,
      requestId: job.request_id,
      operation: 'scan_extract',
      scanCategory,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      baseScore: 0,
      finalScore: 0,
      audits,
      status: 'failed',
    });
  }

  private async loadContext(
    userId: string,
  ): Promise<{ profile: UserProfile | null; insights: IngredientInsight[] }> {
    const context = await this.insights.getInsights(userId);
    return {
      profile: context.profile as UserProfile | null,
      insights: context.insights as IngredientInsight[],
    };
  }

  private async computeDayLoad(
    userId: string,
    scanId: string,
    result: ScanResult,
  ): Promise<ScanDayLoad | undefined> {
    try {
      const ingredients = result.ingredientRisks
        .filter((row) => !row.menuItemSourceId)
        .map((row) => ({
          name: row.canonicalName || row.rawName,
          amountEstimate: row.amountEstimate,
        }));
      if (!ingredients.length) return undefined;
      const priorMeals = await this.crud.priorConsumedSameDayMeals(userId, scanId);
      return buildDayLoadContext(ingredients, priorMeals);
    } catch (error) {
      this.logger.warn(`day-load skipped for scan ${scanId}: ${(error as Error).message}`);
      return undefined;
    }
  }

  private withDayLoad<T extends { analysisMetadata?: unknown }>(
    completion: T,
    dayLoad: ScanDayLoad | undefined,
  ): T {
    if (!dayLoad) return completion;
    return {
      ...completion,
      analysisMetadata: {
        ...((completion.analysisMetadata as Record<string, unknown>) ?? {}),
        dayLoad,
      },
    };
  }

  private async enqueueLearning(userId: string, scanId: string): Promise<void> {
    try {
      await this.learning.enqueue({
        userId,
        eventType: 'scan_analyzed',
        sourceType: 'scan',
        sourceId: scanId,
      });
    } catch (error) {
      this.logger.warn(`learning enqueue failed for scan ${scanId}: ${(error as Error).message}`);
    }
  }

  private async executeImage(
    job: ScanAnalysisJobRow,
    payload: ImageScanJobPayload,
  ): Promise<'food' | 'menu' | 'grocery'> {
    const onStage = this.stageNotifier(job.user_id, job.scan_id);
    onStage('received');

    const { profile, insights } = await this.loadContext(job.user_id);
    const [imageUrls, signedUrls] = await Promise.all([
      Promise.all(
        payload.imageStoragePaths.map((key) => this.storage.readImageDataUrl(job.user_id, key)),
      ),
      Promise.all(payload.imageStoragePaths.map((key) => this.storage.signUrl(key))),
    ]);
    const workflowResult = await this.workflow.run({
      userId: job.user_id,
      scanId: job.scan_id,
      kind: payload.scanCategory === 'menu' ? 'menu' : 'image',
      imageUrls,
      imageUri: signedUrls[0],
      scanCategory: payload.scanCategory,
      autoClassify: payload.autoClassify,
      profile,
      insights,
      onStage,
    });
    const imageRole = workflowResult.scanCategory === 'menu' ? 'menu_page' : 'meal';
    const inputRefs = payload.imageStoragePaths.map((storagePath, pageIndex) => ({
      input_kind: 'image',
      image_role: imageRole,
      storage_path: storagePath,
      page_index: pageIndex,
    }));
    const completion = workflowResult.scanCategory === 'menu'
      ? {
          ...buildMenuCompletionInput(job.user_id, job.scan_id, workflowResult.finalResult),
          inputRefs,
        }
      : this.withDayLoad(
          buildFoodCompletionInput(
            job.user_id,
            job.scan_id,
            workflowResult.finalResult,
            inputRefs,
          ),
          await this.computeDayLoad(job.user_id, job.scan_id, workflowResult.finalResult),
        );

    const completed = await this.jobs.complete(job.id, job.attempt_count, async (sql) => {
      if (payload.autoClassify && workflowResult.scanCategory !== payload.scanCategory) {
        await this.reservation.setCategory(
          job.user_id,
          job.scan_id,
          workflowResult.scanCategory,
          sql,
        );
      }
      await this.reservation.complete(completion, sql);
    });
    if (!completed) return workflowResult.scanCategory;
    await this.enqueueLearning(job.user_id, job.scan_id);
    await this.recordScanTraceSafely({
      userId: job.user_id,
      scanId: job.scan_id,
      requestId: job.request_id,
      operation: 'scan_extract',
      scanCategory: workflowResult.scanCategory,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      baseScore: workflowResult.baseResult.overallRiskScore,
      finalScore: workflowResult.finalResult.overallRiskScore,
      audits: workflowResult.audits,
    });
    return workflowResult.scanCategory;
  }

  private async executeBarcode(job: ScanAnalysisJobRow, barcode: string): Promise<'grocery'> {
    const onStage = this.stageNotifier(job.user_id, job.scan_id);
    onStage('received');
    const productText = await this.lookupBarcode(barcode);
    const { profile, insights } = await this.loadContext(job.user_id);
    const workflowResult = await this.workflow.run({
      userId: job.user_id,
      scanId: job.scan_id,
      kind: 'text',
      text: productText,
      scanCategory: 'grocery',
      profile,
      insights,
      onStage,
    });
    const completion = this.withDayLoad(
      buildFoodCompletionInput(job.user_id, job.scan_id, workflowResult.finalResult),
      await this.computeDayLoad(job.user_id, job.scan_id, workflowResult.finalResult),
    );
    const completed = await this.jobs.complete(job.id, job.attempt_count, async (sql) => {
      await this.jobs.setInputText(job.user_id, job.scan_id, productText, sql);
      await this.reservation.complete(completion, sql);
    });
    if (!completed) return 'grocery';
    await this.enqueueLearning(job.user_id, job.scan_id);
    await this.recordScanTraceSafely({
      userId: job.user_id,
      scanId: job.scan_id,
      requestId: job.request_id,
      operation: 'scan_extract',
      scanCategory: 'grocery',
      promptVersion: EXTRACTION_PROMPT_VERSION,
      baseScore: workflowResult.baseResult.overallRiskScore,
      finalScore: workflowResult.finalResult.overallRiskScore,
      audits: workflowResult.audits,
    });
    return 'grocery';
  }

  async execute(job: ScanAnalysisJobRow): Promise<void> {
    const heartbeat = setInterval(() => {
      void this.jobs.heartbeat(job.id, job.attempt_count).catch((error) => {
        this.logger.warn(`heartbeat failed for scan job ${job.id}: ${(error as Error).message}`);
      });
    }, JOB_HEARTBEAT_INTERVAL_MS);
    try {
      await this.executeClaimedJob(job);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async executeClaimedJob(job: ScanAnalysisJobRow): Promise<void> {
    const existingStatus = await this.jobs.getScanStatus(job.scan_id);
    if (existingStatus === 'completed') {
      await this.jobs.complete(job.id, job.attempt_count);
      return;
    }
    if (existingStatus === 'failed') {
      await this.jobs.fail(
        job.id,
        job.attempt_count,
        'openai_request_failed',
        'The scan already failed.',
      );
      return;
    }

    let scanCategory: 'food' | 'menu' | 'grocery' = 'food';
    try {
      const payload = scanAnalysisJobPayloadSchema.parse(job.payload);
      scanCategory = payload.scanCategory;
      if (payload.kind === 'image') {
        scanCategory = await this.executeImage(job, payload);
      } else {
        scanCategory = await this.executeBarcode(job, payload.barcode);
      }
    } catch (error) {
      const code = failureCode(error);
      const message = failureMessage(code);
      this.logger.error(`scan analysis job ${job.id} failed with ${code}`);
      await this.recordFailedScanTrace(job, scanCategory, error);
      await this.jobs.fail(
        job.id,
        job.attempt_count,
        code,
        message,
        (sql) => this.reservation.fail(job.user_id, job.scan_id, code, message, true, sql),
      ).catch((jobError) => {
        this.logger.error(`could not mark scan analysis job ${job.id} failed: ${(jobError as Error).message}`);
      });
      return;
    }
  }

  private async lookupBarcode(barcode: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,ingredients_text`,
        { signal: controller.signal, headers: { 'user-agent': 'MyTummyHurts/1.0' } },
      ).finally(() => clearTimeout(timer));
      const json = (await response.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; ingredients_text?: string };
      };
      if (json.status === 1 && json.product) {
        return [json.product.brands, json.product.product_name, json.product.ingredients_text]
          .filter(Boolean)
          .join(' - ') || `packaged product ${barcode}`;
      }
    } catch (error) {
      this.logger.warn(
        `[barcode] lookup failed for ${barcode}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return `packaged product (barcode ${barcode})`;
  }
}

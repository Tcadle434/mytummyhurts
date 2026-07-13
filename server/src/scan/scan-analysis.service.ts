import { Injectable, Logger } from '@nestjs/common';

import { CostCapService } from '../common/cost-cap.service';
import { InsightsService } from '../insights/insights.service';
import { LearningJobService } from '../learning/learning-job.service';
import { StorageService } from '../storage/storage.service';
import { TraceService } from '../trace/trace.service';
import { buildDayLoadContext } from './engine/day-load';
import type { IngredientInsight, ScanDayLoad, ScanResult, UserProfile } from './engine/domain';
import { PROMPT_VERSION as EXTRACTION_PROMPT_VERSION, type OpenAiAuditLog } from './engine/openai';
import { buildFoodCompletionInput, buildMenuCompletionInput } from './scan-payload';
import { ScanCrudService } from './scan-crud.service';
import type { ScanStageCallback } from './scan-progress';
import { ScanProgressService } from './scan-progress.service';
import { ScanReservationService } from './scan-reservation.service';
import { ScanWorkflowService } from './workflow/scan-workflow.service';

export interface AnalyzeImageRequest {
  userId: string;
  requestId: string;
  imageDataUrls?: string[];
  imagePaths?: string[];
  sourceType?: string;
  scanCategory?: 'food' | 'menu' | 'grocery';
  localDate?: string | null;
  timezone?: string | null;
}

export interface AnalyzeBarcodeRequest {
  userId: string;
  requestId: string;
  barcode: string;
  localDate?: string | null;
  timezone?: string | null;
}

export interface AnalyzeResult {
  scanId: string;
  deduped: boolean;
  learningSyncStatus: 'queued' | 'failed';
  tokensRemaining: number;
  scan: unknown;
  billing: unknown;
  profile: unknown;
  insights: unknown;
  conditionInsights: unknown;
}

/**
 * Orchestrates a scan: token reservation -> deterministic workflow -> persist via
 * the complete RPC -> enqueue learning. The outer transactional shell (caps,
 * reserve/refund, idempotency) lives here; the graph runs strictly between
 * reservation and completion.
 */
@Injectable()
export class ScanAnalysisService {
  private readonly logger = new Logger('ScanAnalysis');

  constructor(
    private readonly reservation: ScanReservationService,
    private readonly workflow: ScanWorkflowService,
    private readonly learning: LearningJobService,
    private readonly storage: StorageService,
    private readonly crud: ScanCrudService,
    private readonly insights: InsightsService,
    private readonly trace: TraceService,
    private readonly costCap: CostCapService,
    private readonly progress: ScanProgressService,
  ) {}

  // Fire-and-forget stage stamps: setStage never rejects, so progress can
  // never slow down or fail the analysis itself.
  private stageNotifier(userId: string, scanId: string): ScanStageCallback {
    return (stage, detail) => {
      void this.progress.setStage(userId, scanId, stage, detail);
    };
  }

  // A failed scan must still leave a trace. Errors thrown inside the workflow
  // carry the failed stage's audit(s) on the error object; persist them with a
  // failed ai_traces row so failures are debuggable instead of vanishing.
  // recordScanTrace is best-effort and never throws.
  private async recordFailedScanTrace(
    userId: string,
    scanId: string,
    requestId: string,
    scanCategory: 'food' | 'menu' | 'grocery',
    err: unknown,
  ): Promise<void> {
    const carrier = (err ?? {}) as { audit?: OpenAiAuditLog; audits?: OpenAiAuditLog[] };
    const audits = [
      ...(Array.isArray(carrier.audits) ? carrier.audits : []),
      ...(carrier.audit ? [carrier.audit] : []),
    ];
    await this.trace.recordScanTrace({
      userId,
      scanId,
      requestId,
      operation: 'scan_extract',
      scanCategory,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      baseScore: 0,
      finalScore: 0,
      audits,
      status: 'failed',
    });
  }

  // Assemble the full AnalyzeResponse the app expects: the persisted scan plus
  // the user's current billing / profile / insights.
  private async buildResponse(
    userId: string,
    scanId: string,
    deduped: boolean,
    tokensRemaining: number,
  ): Promise<AnalyzeResult> {
    const [{ scan }, ctx] = await Promise.all([
      this.crud.getScan(userId, scanId),
      this.insights.getInsights(userId),
    ]);
    return {
      scanId,
      deduped,
      learningSyncStatus: 'queued',
      tokensRemaining,
      scan,
      billing: ctx.billing,
      profile: ctx.profile,
      insights: ctx.insights,
      conditionInsights: ctx.conditionInsights,
    };
  }

  private async loadContext(
    userId: string,
  ): Promise<{ profile: UserProfile | null; insights: IngredientInsight[] }> {
    const ctx = await this.insights.getInsights(userId);
    return {
      profile: ctx.profile as UserProfile | null,
      insights: ctx.insights as IngredientInsight[],
    };
  }

  // Day-load context (Phase 4): does this meal repeat a risk mechanism from an
  // earlier consumed meal today? Display + data only — never moves the score —
  // and strictly best-effort: any failure logs and the scan completes without it.
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
    } catch (err) {
      this.logger.warn(`day-load skipped for scan ${scanId}: ${(err as Error).message}`);
      return undefined;
    }
  }

  // The dayLoad rides inside analysis_metadata so scan-get can return it
  // without a schema change; absent when nothing stacked.
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

  async analyzeImage(req: AnalyzeImageRequest): Promise<AnalyzeResult> {
    await this.costCap.assertWithinCap(req.userId);
    // Store inline images first so we have stable keys for input_refs + signed URLs.
    const keys: string[] = [...(req.imagePaths ?? [])];
    for (let i = 0; i < (req.imageDataUrls?.length ?? 0); i++) {
      keys.push(await this.storage.putInlineImage(req.userId, req.imageDataUrls![i], i));
    }

    const begin = await this.reservation.begin({
      userId: req.userId,
      requestId: req.requestId,
      sourceType: req.sourceType ?? 'camera',
      imageStoragePath: keys[0] ?? null,
      scanCategory: req.scanCategory ?? 'food',
      localDate: req.localDate ?? null,
      timezone: req.timezone ?? null,
    });
    if (begin.error_code) throw new Error(begin.error_code);
    const scanId = begin.scan_id as string;
    if (begin.deduped) {
      return this.buildResponse(req.userId, scanId, true, begin.tokens_remaining);
    }
    const onStage = this.stageNotifier(req.userId, scanId);
    onStage('received');

    try {
      const { profile, insights } = await this.loadContext(req.userId);
      const signedUrls = await Promise.all(keys.map((k) => this.storage.signUrl(k)));
      // OpenAI fetches image URLs from its own servers, so signed storage URLs
      // only work when S3 is publicly reachable (prod). Inline uploads keep
      // their original data URLs for the LLM call — same bytes, no public
      // fetch required — which is what makes local/CI golden-eval runs (MinIO
      // on localhost) possible at all. `keys` is imagePaths then inline
      // uploads, so the slice keeps the page order aligned.
      const llmImageUrls = [
        ...signedUrls.slice(0, req.imagePaths?.length ?? 0),
        ...(req.imageDataUrls ?? []),
      ];
      const wf = await this.workflow.run({
        userId: req.userId,
        scanId,
        kind: req.scanCategory === 'menu' ? 'menu' : 'image',
        imageUrls: llmImageUrls,
        imageUri: signedUrls[0],
        scanCategory: req.scanCategory ?? 'food',
        autoClassify: !req.scanCategory, // auto-detect food vs menu when unspecified
        profile,
        insights,
        onStage,
      });
      if (!req.scanCategory && wf.scanCategory !== 'food') {
        await this.reservation.setCategory(req.userId, scanId, wf.scanCategory);
      }
      const imageRole = wf.scanCategory === 'menu' ? 'menu_page' : 'meal';
      const inputRefs = keys.map((k, i) => ({
        input_kind: 'image',
        image_role: imageRole,
        storage_path: k,
        page_index: i,
      }));
      // Menu results rank a menu rather than describe one eaten meal, so
      // day-load applies to food/grocery scans only (v1).
      const completion =
        wf.scanCategory === 'menu'
          ? { ...buildMenuCompletionInput(req.userId, scanId, wf.finalResult), inputRefs }
          : this.withDayLoad(
              buildFoodCompletionInput(req.userId, scanId, wf.finalResult, inputRefs),
              await this.computeDayLoad(req.userId, scanId, wf.finalResult),
            );
      await this.reservation.complete(completion);
      await this.learning.enqueue({ userId: req.userId, eventType: 'scan_analyzed', sourceType: 'scan', sourceId: scanId });
      await this.trace.recordScanTrace({
        userId: req.userId,
        scanId,
        requestId: req.requestId,
        operation: 'scan_extract',
        scanCategory: wf.scanCategory,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        baseScore: wf.baseResult.overallRiskScore,
        finalScore: wf.finalResult.overallRiskScore,
        audits: wf.audits,
      });
      return this.buildResponse(req.userId, scanId, false, begin.tokens_remaining);
    } catch (err) {
      await this.recordFailedScanTrace(req.userId, scanId, req.requestId, req.scanCategory ?? 'food', err);
      await this.reservation.fail(req.userId, scanId, 'analysis_failed', (err as Error).message, true);
      throw err;
    }
  }

  async analyzeBarcode(req: AnalyzeBarcodeRequest): Promise<AnalyzeResult> {
    await this.costCap.assertWithinCap(req.userId);
    const productText = await this.lookupBarcode(req.barcode);
    const begin = await this.reservation.begin({
      userId: req.userId,
      requestId: req.requestId,
      sourceType: 'barcode',
      inputText: productText,
      scanCategory: 'grocery',
      localDate: req.localDate ?? null,
      timezone: req.timezone ?? null,
    });
    if (begin.error_code) throw new Error(begin.error_code);
    const scanId = begin.scan_id as string;
    if (begin.deduped) {
      return this.buildResponse(req.userId, scanId, true, begin.tokens_remaining);
    }
    const onStage = this.stageNotifier(req.userId, scanId);
    onStage('received');
    try {
      const { profile, insights } = await this.loadContext(req.userId);
      const wf = await this.workflow.run({
        userId: req.userId,
        scanId,
        kind: 'text',
        text: productText,
        scanCategory: 'grocery',
        profile,
        insights,
        onStage,
      });
      await this.reservation.complete(
        this.withDayLoad(
          buildFoodCompletionInput(req.userId, scanId, wf.finalResult),
          await this.computeDayLoad(req.userId, scanId, wf.finalResult),
        ),
      );
      await this.learning.enqueue({ userId: req.userId, eventType: 'scan_analyzed', sourceType: 'scan', sourceId: scanId });
      await this.trace.recordScanTrace({
        userId: req.userId,
        scanId,
        requestId: req.requestId,
        operation: 'scan_extract',
        scanCategory: wf.scanCategory,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        baseScore: wf.baseResult.overallRiskScore,
        finalScore: wf.finalResult.overallRiskScore,
        audits: wf.audits,
      });
      return this.buildResponse(req.userId, scanId, false, begin.tokens_remaining);
    } catch (err) {
      await this.recordFailedScanTrace(req.userId, scanId, req.requestId, 'grocery', err);
      await this.reservation.fail(req.userId, scanId, 'analysis_failed', (err as Error).message, true);
      throw err;
    }
  }

  // Minimal Open Food Facts lookup -> a product description the extractor reads.
  // Resilient: any failure falls back to a generic description so the scan still
  // completes. (The richer openFoodFacts.ts mapping can be ported later.)
  private async lookupBarcode(barcode: string): Promise<string> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,ingredients_text`,
        { signal: ctrl.signal, headers: { 'user-agent': 'MyTummyHurts/1.0' } },
      ).finally(() => clearTimeout(timer));
      const json = (await res.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; ingredients_text?: string };
      };
      if (json.status === 1 && json.product) {
        const p = json.product;
        return [p.brands, p.product_name, p.ingredients_text].filter(Boolean).join(' — ') || `packaged product ${barcode}`;
      }
    } catch (err) {
      this.logger.warn(
        `[barcode] lookup failed for ${barcode}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return `packaged product (barcode ${barcode})`;
  }

}

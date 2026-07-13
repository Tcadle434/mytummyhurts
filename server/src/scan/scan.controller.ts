import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { ScanAnalysisService } from './scan-analysis.service';
import { ScanAnalysisWorker } from './scan-analysis.worker';
import { ScanCrudService } from './scan-crud.service';
import { ScanProgressService } from './scan-progress.service';

// Tight per-user/IP limit for the expensive AI scan endpoints (vs the global 120/min).
const AI_HEAVY = { default: { limit: 20, ttl: 60_000 } };

export class AnalyzeImageDto {
  @IsString() requestId!: string;
  @IsOptional() @IsString() imageDataUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) imageDataUrls?: string[];
  @IsOptional() @IsString() imagePath?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) imagePaths?: string[];
  @IsOptional() @IsArray() thumbnailImagePaths?: (string | null)[];
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsIn(['food', 'menu', 'grocery']) scanCategory?: 'food' | 'menu' | 'grocery';
  @IsOptional() @IsString() localDate?: string;
  @IsOptional() @IsString() timezone?: string;
}

class AnalyzeBarcodeDto {
  @IsString() requestId!: string;
  @IsString() barcode!: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() scanCategory?: string;
  @IsOptional() @IsString() localDate?: string;
  @IsOptional() @IsString() timezone?: string;
}

class ScanIdDto {
  @IsString() scanId!: string;
}

class ScanAnalysisResultDto {
  @IsString() scanId!: string;
}

class ScanProgressDto {
  @IsString() requestId!: string;
}

class ConsumptionDto {
  @IsString() scanId!: string;
  @IsOptional() @IsIn(['unknown', 'consumed', 'skipped']) consumptionStatus?:
    | 'unknown'
    | 'consumed'
    | 'skipped';
  @IsOptional() @IsArray() consumedMenuItemSourceIds?: string[];
  // Additive (Phase 4): one-tap portion on the consumed confirm. Optional so
  // older clients keep working; absent means "leave the stored answer alone".
  @IsOptional() @IsIn(['light', 'normal', 'heavy']) consumptionPortion?:
    | 'light'
    | 'normal'
    | 'heavy';
}

class HistoryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) pageSize?: number;
  @IsOptional() includeDailyReports?: boolean;
  @IsOptional() @IsIn(['food', 'menu', 'grocery']) scanCategory?: 'food' | 'menu' | 'grocery';
}

export function normalizeAnalyzeImageDto(dto: AnalyzeImageDto): {
  imageDataUrls: string[] | undefined;
  imagePaths: string[] | undefined;
} {
  const imageDataUrls = dto.imageDataUrls?.length
    ? dto.imageDataUrls
    : dto.imageDataUrl
      ? [dto.imageDataUrl]
      : undefined;
  const imagePaths = dto.imagePaths?.length
    ? dto.imagePaths
    : dto.imagePath
      ? [dto.imagePath]
      : undefined;
  return { imageDataUrls, imagePaths };
}

@Controller('v1')
export class ScanController {
  constructor(
    private readonly analysis: ScanAnalysisService,
    private readonly crud: ScanCrudService,
    private readonly progress: ScanProgressService,
    private readonly analysisWorker: ScanAnalysisWorker,
  ) {}

  @Throttle(AI_HEAVY)
  @Post('scan-analyze-image')
  analyzeImage(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeImageDto) {
    const normalized = normalizeAnalyzeImageDto(dto);
    return this.analysis.analyzeImage({
      userId: user.id,
      requestId: dto.requestId,
      imageDataUrls: normalized.imageDataUrls,
      imagePaths: normalized.imagePaths,
      sourceType: dto.sourceType,
      scanCategory: dto.scanCategory,
      localDate: dto.localDate,
      timezone: dto.timezone,
    });
  }

  @Throttle(AI_HEAVY)
  @Post('scan-analysis-start')
  async startImageAnalysis(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeImageDto) {
    const normalized = normalizeAnalyzeImageDto(dto);
    const result = await this.analysis.startImage({
      userId: user.id,
      requestId: dto.requestId,
      imageDataUrls: normalized.imageDataUrls,
      imagePaths: normalized.imagePaths,
      sourceType: dto.sourceType,
      scanCategory: dto.scanCategory,
      localDate: dto.localDate,
      timezone: dto.timezone,
    });
    this.analysisWorker.kick();
    return result;
  }

  @Throttle(AI_HEAVY)
  @Post('scan-analyze-barcode')
  analyzeBarcode(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeBarcodeDto) {
    return this.analysis.analyzeBarcode({
      userId: user.id,
      requestId: dto.requestId,
      barcode: dto.barcode,
      localDate: dto.localDate,
      timezone: dto.timezone,
    });
  }

  @Throttle(AI_HEAVY)
  @Post('scan-barcode-analysis-start')
  async startBarcodeAnalysis(@CurrentUser() user: AuthUser, @Body() dto: AnalyzeBarcodeDto) {
    const result = await this.analysis.startBarcode({
      userId: user.id,
      requestId: dto.requestId,
      barcode: dto.barcode,
      sourceType: dto.sourceType,
      localDate: dto.localDate,
      timezone: dto.timezone,
    });
    this.analysisWorker.kick();
    return result;
  }

  @Post('scan-analysis-result')
  analysisResult(@CurrentUser() user: AuthUser, @Body() dto: ScanAnalysisResultDto) {
    return this.analysis.getResult(user.id, dto.scanId);
  }

  // Lightweight display-only progress for the analyzing screen. The durable
  // result endpoint stays the source of truth for completion.
  @Post('scan-progress')
  scanProgress(@CurrentUser() user: AuthUser, @Body() dto: ScanProgressDto) {
    return this.progress.getProgress(user.id, dto.requestId);
  }

  @Post('scan-get')
  getScan(@CurrentUser() user: AuthUser, @Body() dto: ScanIdDto) {
    return this.crud.getScan(user.id, dto.scanId);
  }

  @Post('scan-delete')
  deleteScan(@CurrentUser() user: AuthUser, @Body() dto: ScanIdDto) {
    return this.crud.deleteScan(user.id, dto.scanId);
  }

  @Post('scan-consumption-update')
  updateConsumption(@CurrentUser() user: AuthUser, @Body() dto: ConsumptionDto) {
    return this.crud.updateConsumption(
      user.id,
      dto.scanId,
      dto.consumptionStatus,
      dto.consumedMenuItemSourceIds ?? [],
      dto.consumptionPortion,
    );
  }

  @Post('history-get')
  history(@CurrentUser() user: AuthUser, @Body() dto: HistoryDto) {
    return this.crud.history(
      user.id,
      dto.page ?? 1,
      dto.pageSize ?? 12,
      dto.scanCategory,
      dto.includeDailyReports ?? false,
    );
  }
}

import { z } from 'zod';

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
  sourceType?: string;
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

export type ScanAnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ScanAnalysisPublicStatus = 'queued' | 'processing' | 'completed' | 'failed';

const nonblankString = z.string().trim().min(1);
const scanCategorySchema = z.enum(['food', 'menu', 'grocery']);

export const imageScanJobPayloadSchema = z.object({
  kind: z.literal('image'),
  imageStoragePaths: z.array(nonblankString).min(1).max(8),
  sourceType: nonblankString,
  scanCategory: scanCategorySchema,
  autoClassify: z.boolean(),
}).strict();

export const barcodeScanJobPayloadSchema = z.object({
  kind: z.literal('barcode'),
  barcode: nonblankString,
  sourceType: nonblankString,
  scanCategory: z.literal('grocery'),
}).strict();

export const scanAnalysisJobPayloadSchema = z.discriminatedUnion('kind', [
  imageScanJobPayloadSchema,
  barcodeScanJobPayloadSchema,
]);

export type ImageScanJobPayload = z.infer<typeof imageScanJobPayloadSchema>;
export type BarcodeScanJobPayload = z.infer<typeof barcodeScanJobPayloadSchema>;
export type ScanAnalysisJobPayload = z.infer<typeof scanAnalysisJobPayloadSchema>;

export interface ScanAnalysisJobRow {
  id: string;
  scan_id: string;
  user_id: string;
  request_id: string;
  status: ScanAnalysisJobStatus;
  payload: unknown;
  reserved_tokens_remaining: number;
  attempt_count: number;
  error_code: string | null;
  last_error: string | null;
}

export interface ScanAnalysisStartResult {
  ok: true;
  scanId: string;
  requestId: string;
  status: ScanAnalysisPublicStatus;
  deduped: boolean;
  tokensRemaining: number;
}

export interface ScanAnalysisError {
  code: 'ai_request_failed' | 'request_timeout';
  message: string;
  retryable: true;
}

export interface ScanAnalysisResultSnapshot {
  ok: true;
  scanId: string;
  requestId: string;
  status: ScanAnalysisPublicStatus;
  stage: string | null;
  ingredientsPreview: string[];
  result: AnalyzeResult | null;
  error: ScanAnalysisError | null;
}

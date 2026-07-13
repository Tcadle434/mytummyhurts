import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

export interface BeginScanInput {
  userId: string;
  requestId: string;
  sourceType: string;
  imageStoragePath?: string | null;
  inputText?: string | null;
  scanCategory?: string | null;
  localDate?: string | null;
  timezone?: string | null;
}

export interface ScanCompletionInput {
  userId: string;
  scanId: string;
  title: string;
  overallRiskScore: number;
  overallRiskLevel: string;
  pipTake?: string | null;
  summary?: string | null;
  baseFoodCategory?: unknown;
  riskModifiers?: unknown;
  scoreContributors?: unknown;
  scoringConfidence?: string | null;
  gutRecommendation?: string | null;
  rubricVersion?: string | null;
  conditionRisks?: unknown;
  ingredientRisks?: unknown;
  dietEvaluations?: unknown;
  menuItems?: unknown;
  groceryProduct?: unknown;
  inputRefs?: unknown;
  analysisMetadata?: unknown;
  gutScoreImpact?: unknown;
}

/**
 * Thin wrapper over the reserved-scan lifecycle RPCs (begin/complete/fail).
 * These are SECURITY DEFINER functions replayed from the original migrations;
 * invoking them preserves the exact token-reservation, idempotency, and refund
 * semantics without re-implementing them in TypeScript.
 */
@Injectable()
export class ScanReservationService {
  constructor(private readonly db: DatabaseService) {}

  begin(input: BeginScanInput) {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from begin_scan_analysis(
          ${input.userId}, ${input.requestId}, ${input.sourceType},
          ${input.imageStoragePath ?? null}, ${input.inputText ?? null},
          ${input.scanCategory ?? null}, ${input.localDate ?? null}, ${input.timezone ?? null})`;
      return row;
    });
  }

  setCategory(userId: string, scanId: string, scanCategory: 'food' | 'menu' | 'grocery') {
    return this.db.service(async (sql) => {
      const rows = await sql`
        update public.scans
        set scan_category = ${scanCategory}
        where id = ${scanId}
          and user_id = ${userId}
          and analysis_status = 'processing'
        returning id`;
      if (!rows.length) throw new Error('scan_category_update_failed');
    });
  }

  complete(input: ScanCompletionInput) {
    return this.db.service(async (sql) => {
      const j = (v: unknown) => (v === undefined || v === null ? null : sql.json(v as never));
      const [row] = await sql`
        select * from complete_reserved_scan_analysis(
          ${input.userId}, ${input.scanId}, ${input.title},
          ${input.overallRiskScore}, ${input.overallRiskLevel},
          ${input.pipTake ?? null}, ${input.summary ?? null},
          ${j(input.baseFoodCategory)}, ${j(input.riskModifiers ?? [])},
          ${j(input.scoreContributors ?? [])}, ${input.scoringConfidence ?? null},
          ${input.gutRecommendation ?? null}, ${input.rubricVersion ?? null},
          ${j(input.conditionRisks ?? [])}, ${j(input.ingredientRisks ?? [])},
          ${j(input.dietEvaluations ?? [])}, ${j(input.menuItems ?? [])},
          ${j(input.groceryProduct)}, ${j(input.inputRefs ?? [])},
          ${j(input.analysisMetadata)}, ${j(input.gutScoreImpact)})`;
      return row;
    });
  }

  fail(userId: string, scanId: string, errorCode: string, errorMessage: string, refund = true) {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from fail_reserved_scan_analysis(${userId}, ${scanId}, ${errorCode}, ${errorMessage}, ${refund})`;
      return row;
    });
  }
}

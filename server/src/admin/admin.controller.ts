import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

import { Public } from '../auth/decorators/public.decorator';
import { DatabaseService } from '../database/database.service';
import { EvalRunnerService } from '../eval/eval-runner.service';
import { GOLDEN_CASES } from '../eval/golden-dataset';
import { ValidityRecomputeService } from '../learning/validity-recompute.service';
import { RagIngestionService } from '../rag/ingestion.service';
import { InternalSecretGuard } from './internal-secret.guard';

class IngestDocumentDto {
  @IsString() title!: string;
  @IsIn(['pdf', 'markdown', 'html', 'text', 'web_scrape']) sourceType!:
    | 'pdf'
    | 'markdown'
    | 'html'
    | 'text'
    | 'web_scrape';
  @IsString() content!: string;
  @IsOptional() @IsString() sourceUrl?: string;
  @IsOptional() @IsString() sourceName?: string;
  @IsOptional() @IsArray() conditionTags?: string[];
  @IsOptional() @IsArray() ingredientTags?: string[];
}

// All admin endpoints bypass the user JWT (@Public) but require the admin secret.
@Public()
@UseGuards(InternalSecretGuard)
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly ingestion: RagIngestionService,
    private readonly evals: EvalRunnerService,
    private readonly db: DatabaseService,
    private readonly validity: ValidityRecomputeService,
  ) {}

  // Nightly predictive-validity sweep (VPS crontab — docs/predictive-validity.md).
  @Post('validity/sweep')
  validitySweep() {
    return this.validity.sweep();
  }

  @Post('rag/documents')
  ingest(@Body() dto: IngestDocumentDto) {
    return this.ingestion.ingest(dto);
  }

  @Post('rag/documents/:id/publish')
  async publish(@Param('id') id: string) {
    await this.ingestion.publish(id);
    return { ok: true };
  }

  @Post('evals/run')
  runEvals(@Body() body: { datasetKey?: string }) {
    return this.evals.run(GOLDEN_CASES, body?.datasetKey ?? 'golden_scan_v1');
  }

  // Trace inspection (never exposed to normal users).
  @Get('traces')
  traces() {
    return this.db.service(
      (sql) => sql`
        select id, operation, status, scan_id, total_cost_usd_micros, created_at
        from public.ai_traces order by created_at desc limit 50`,
    );
  }

  @Get('cost/rollup')
  costRollup() {
    return this.db.service(
      (sql) => sql`
        select operation, count(*)::int as calls, sum(estimated_cost_usd_micros)::bigint as cost_micros
        from public.ai_cost_events
        where created_at > now() - interval '30 days'
        group by operation order by cost_micros desc`,
    );
  }
}

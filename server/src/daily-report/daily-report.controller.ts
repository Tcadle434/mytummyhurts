import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsArray, Max, Min } from 'class-validator';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { DailyReportService } from './daily-report.service';

class DailyReportDto {
  @IsString() localDate!: string;
  @IsInt() @Min(0) @Max(10) gutSeverity!: number;
  @IsOptional() @IsArray() symptomTags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsIn(['typical', 'unscanned']) evidenceQuality?: 'typical' | 'unscanned';
}

@Controller('v1')
export class DailyReportController {
  constructor(private readonly svc: DailyReportService) {}

  @Post('daily-report-upsert')
  upsert(@CurrentUser() user: AuthUser, @Body() dto: DailyReportDto) {
    return this.svc.upsert(user.id, dto);
  }
}

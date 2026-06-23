import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { InsightsService } from './insights.service';

class InsightsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() limit?: number;
}

class LearningRecomputeDto {
  @IsIn(['daily_gut_report', 'scan', 'profile']) sourceType!: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsString() eventType?: string;
}

@Controller('v1')
export class InsightsController {
  constructor(private readonly svc: InsightsService) {}

  @Post('insights-get')
  insights(@CurrentUser() user: AuthUser, @Body() dto: InsightsDto) {
    return this.svc.getInsights(user.id, dto.search, dto.limit ?? 200);
  }

  @Post('learning-recompute')
  recompute(@CurrentUser() user: AuthUser, @Body() dto: LearningRecomputeDto) {
    return this.svc.recompute(user.id, dto.sourceType, dto.sourceId);
  }
}

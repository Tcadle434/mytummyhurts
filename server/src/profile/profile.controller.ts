import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProfileService } from './profile.service';

class ProfileUpdateDto {
  @IsOptional() @IsObject() onboardingAnswers?: Record<string, unknown>;
  @IsOptional() @IsString() displayName?: string | null;
  @IsOptional() @IsArray() knownConditions?: string[];
  @IsOptional() @IsArray() knownIngredientSensitivities?: string[];
  @IsOptional() @IsArray() commonSymptoms?: string[];
  @IsOptional() @IsString() symptomFrequency?: string;
  @IsOptional() @IsString() symptomSeverityBaseline?: string;
  @IsOptional() @IsArray() mealContexts?: string[];
  @IsOptional() @IsString() motivation?: string;
  @IsOptional() @IsArray() currentEatingPatterns?: string[];
  @IsOptional() @IsArray() lifestyleFactors?: string[];
  @IsOptional() @IsArray() foodsToReintroduce?: string[];
  @IsOptional() @IsObject() calibrationRatings?: Record<string, unknown>;
  @IsOptional() @IsString() lastBadMealText?: string;
  @IsOptional() @IsArray() dietPreferences?: unknown[];
}

@Controller('v1')
export class ProfileController {
  constructor(private readonly svc: ProfileService) {}

  @Post('profile-update')
  update(@CurrentUser() user: AuthUser, @Body() dto: ProfileUpdateDto) {
    return this.svc.update(user.id, dto);
  }
}

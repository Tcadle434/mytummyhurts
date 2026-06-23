import { Body, Controller, Post } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';

import { AuthService } from './auth.service';
import { AuthUser, CurrentUser } from './decorators/current-user.decorator';

class ExistingAccountCheckDto {
  @IsOptional() @IsBoolean() cleanupFreshUnentitledUser?: boolean;
}

// Authenticated (NOT @Public) — the onboarding gate needs the user's identity.
@Controller('v1')
export class AuthCheckController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth-existing-account-check')
  check(@CurrentUser() user: AuthUser, @Body() dto: ExistingAccountCheckDto) {
    return this.auth.existingAccountCheck(user.id, dto?.cleanupFreshUnentitledUser ?? false);
  }
}

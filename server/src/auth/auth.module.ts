import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthCheckController } from './auth-check.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AppleVerifier } from './verifiers/apple.verifier';
import { GoogleVerifier } from './verifiers/google.verifier';

@Module({
  controllers: [AuthController, AuthCheckController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    AppleVerifier,
    GoogleVerifier,
    // Global authentication: every route requires a valid access token unless
    // marked @Public(). Replaces the per-edge-function requireUser() call.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}

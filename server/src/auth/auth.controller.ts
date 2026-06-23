import { Body, Controller, Headers, Post } from '@nestjs/common';

import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  AppleSignInDto,
  EmailSignInDto,
  GoogleSignInDto,
  RefreshDto,
  SignOutDto,
} from './dto';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('apple')
  apple(@Body() dto: AppleSignInDto, @Headers('user-agent') ua?: string) {
    return this.auth.signInWithApple(dto.identityToken, dto.nonce, ua);
  }

  @Public()
  @Post('google')
  google(@Body() dto: GoogleSignInDto, @Headers('user-agent') ua?: string) {
    return this.auth.signInWithGoogle(dto.idToken, ua);
  }

  @Public()
  @Post('email/sign-in')
  emailSignIn(@Body() dto: EmailSignInDto, @Headers('user-agent') ua?: string) {
    return this.auth.signInWithEmail(dto.email, dto.password, ua);
  }

  @Public()
  @Post('email/sign-up')
  emailSignUp(@Body() dto: EmailSignInDto, @Headers('user-agent') ua?: string) {
    return this.auth.signUpWithEmail(dto.email, dto.password, ua);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, ua);
  }

  @Public()
  @Post('sign-out')
  signOut(@Body() dto: SignOutDto) {
    return this.auth.signOut(dto.refreshToken);
  }
}

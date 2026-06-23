import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AppleSignInDto {
  @IsString() identityToken!: string;
  @IsOptional() @IsString() nonce?: string;
}

export class GoogleSignInDto {
  @IsString() idToken!: string;
}

export class EmailSignInDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}

export class RefreshDto {
  @IsString() refreshToken!: string;
}

export class SignOutDto {
  @IsString() refreshToken!: string;
}

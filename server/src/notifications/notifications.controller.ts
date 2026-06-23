import { Body, Controller, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

class RegisterTokenDto {
  @IsString() pushToken!: string;
  @IsOptional() @IsIn(['ios', 'android']) platform?: string;
}

@Controller('v1')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Post('notifications-register-token')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterTokenDto) {
    return this.svc.registerToken(user.id, dto.pushToken, dto.platform ?? 'ios');
  }
}

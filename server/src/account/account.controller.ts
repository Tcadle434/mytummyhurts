import { Controller, Post } from '@nestjs/common';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountService } from './account.service';

@Controller('v1')
export class AccountController {
  constructor(private readonly svc: AccountService) {}

  @Post('account-delete')
  delete(@CurrentUser() user: AuthUser) {
    return this.svc.deleteAccount(user.id);
  }
}

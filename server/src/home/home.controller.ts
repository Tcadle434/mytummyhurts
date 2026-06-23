import { Controller, Post } from '@nestjs/common';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { HomeService } from './home.service';

@Controller('v1')
export class HomeController {
  constructor(private readonly svc: HomeService) {}

  @Post('home-get')
  home(@CurrentUser() user: AuthUser) {
    return this.svc.getHome(user.id);
  }
}

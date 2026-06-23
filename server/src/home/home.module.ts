import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [BillingModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}

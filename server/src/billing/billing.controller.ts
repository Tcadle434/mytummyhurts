import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { BillingService } from './billing.service';

class BillingSyncDto {
  @IsOptional() @IsIn(['monthly', 'annual']) planCode?: 'monthly' | 'annual';
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() trialEndsAt?: string;
  @IsOptional() @IsString() renewalAt?: string;
  @IsOptional() @IsNumber() monthlyAllowance?: number;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() providerSubscriptionId?: string;
  @IsOptional() @IsString() currentPeriodStart?: string;
  @IsOptional() @IsString() transactionId?: string;
  @IsOptional() @IsString() originalTransactionId?: string;
}

class TokensTopUpDto {
  @IsString() productId!: string;
  @IsString() transactionId!: string;
  @IsOptional() @IsString() originalTransactionId?: string;
}

@Controller('v1')
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Post('billing-sync')
  sync(@CurrentUser() user: AuthUser, @Body() dto: BillingSyncDto) {
    return this.svc.sync(user.id, dto);
  }

  @Post('tokens-topup')
  topUp(@CurrentUser() user: AuthUser, @Body() dto: TokensTopUpDto) {
    return this.svc.topUp(user.id, dto.productId, dto.transactionId);
  }

  // Server-authoritative subscription state from RevenueCat. Verified by a shared
  // secret (Authorization header), not the user JWT.
  @Public()
  @Post('webhooks/revenuecat')
  async revenueCatWebhook(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { event?: { app_user_id?: string; type?: string } },
  ) {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) throw new UnauthorizedException('webhook_unauthorized');
    const event = body?.event ?? {};
    const userId = event.app_user_id;
    if (!userId) return { ok: true as const };
    const active = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'];
    const expired = ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'];
    const status = active.includes(event.type ?? '')
      ? 'active'
      : expired.includes(event.type ?? '')
        ? 'expired'
        : undefined;
    if (status) {
      try {
        await this.svc.applyTrustedSubscriptionState(userId, { status });
      } catch {
        // invalid app_user_id / not a UUID -> ignore
      }
    }
    return { ok: true as const };
  }
}

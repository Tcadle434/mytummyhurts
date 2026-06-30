import { Global, Module } from '@nestjs/common';

import { CostCapService } from './cost-cap.service';
import { OperationLockService } from './operation-lock.service';
import { TokenLedgerService } from './token-ledger.service';

@Global()
@Module({
  providers: [OperationLockService, TokenLedgerService, CostCapService],
  exports: [OperationLockService, TokenLedgerService, CostCapService],
})
export class CommonModule {}

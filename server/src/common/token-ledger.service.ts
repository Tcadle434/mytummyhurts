import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

/** Wraps the token-ledger RPCs (set_token_balance, apply_external_token_delta). */
@Injectable()
export class TokenLedgerService {
  constructor(private readonly db: DatabaseService) {}

  setBalance(userId: string, target: number, reason: string, referenceId: string | null = null) {
    return this.db.service(async (sql) => {
      const [row] =
        await sql`select * from set_token_balance(${userId}, ${target}, ${reason}, ${referenceId})`;
      return row;
    });
  }

  applyExternalDelta(
    userId: string,
    delta: number,
    reason: string,
    externalReference: string,
    provider = 'app_store',
  ) {
    return this.db.service(async (sql) => {
      const [row] = await sql`
        select * from apply_external_token_delta(${userId}, ${delta}, ${reason}, ${externalReference}, ${provider})`;
      return row;
    });
  }
}

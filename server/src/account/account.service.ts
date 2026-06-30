import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  async deleteAccount(userId: string) {
    // Wipe the user's stored images, then cascade-delete the user row (every
    // user-owned table + auth_identities/credentials/refresh_tokens FK-cascade).
    await this.storage.removePrefix(userId).catch(() => {});
    await this.db.service((sql) => sql`delete from public.users where id = ${userId}`);
    return { ok: true as const };
  }
}

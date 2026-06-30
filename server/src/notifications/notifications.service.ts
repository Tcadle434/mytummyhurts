import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async registerToken(userId: string, pushToken: string, platform = 'ios') {
    await this.db.service(
      (sql) => sql`
        insert into public.device_tokens (user_id, platform, push_token)
        values (${userId}, ${platform}, ${pushToken})
        on conflict (user_id, push_token)
        do update set disabled_at = null, updated_at = now()`,
    );
    return { ok: true as const };
  }
}

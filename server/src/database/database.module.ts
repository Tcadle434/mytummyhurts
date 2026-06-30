import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';

import { PG_SCOPED, PG_SERVICE } from './database.constants';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: PG_SCOPED,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        postgres(config.getOrThrow<string>('DATABASE_URL'), {
          max: 10,
          onnotice: () => {},
        }),
    },
    {
      provide: PG_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        postgres(
          config.get<string>('DATABASE_SERVICE_URL') ??
            config.getOrThrow<string>('DATABASE_URL'),
          { max: 5, onnotice: () => {} },
        ),
    },
    DatabaseService,
  ],
  exports: [DatabaseService, PG_SCOPED, PG_SERVICE],
})
export class DatabaseModule {}
